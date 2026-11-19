import json
from unittest import TestCase
from ainuoke_bridge.selected_source_once import collect_selected
from ainuoke_bridge.ainuoke_client import NetworkAinuokeError
from selected_source_fixture import FakeSelectedTransport, mutate_rows
from test_selected_source_once import CONFIG
from ainuoke_bridge.contracts import build_report_snapshot


class CatalogRecaptureTests(TestCase):
    def test_equal_json_numbers_keep_business_identity_without_rewriting_values_or_unknown_fields(self):
        def snapshot(**values):
            return build_report_snapshot(report_key='order_discovery', rows=[{'id':'1','BillNo':'SYN-1',**values}],
                                         page=1,page_size=50,total=1,query_context={})
        for field in ('Price','Num','DeliveryDate','ContractDate','Status','GoodsDesc','Brand','CustomerName'):
            before, after = snapshot(**{field:1}), snapshot(**{field:1.0})
            self.assertEqual(before.rows[0].source_row_identity, after.rows[0].source_row_identity)
            self.assertIs(type(after.rows[0].values[field]), float)
            self.assertNotEqual(before.snapshot_hash, after.snapshot_hash)
        self.assertNotEqual(snapshot(Price=1).rows[0].source_row_identity, snapshot(Price='1').rows[0].source_row_identity)
        self.assertNotEqual(snapshot(Unknown=1).rows[0].source_row_identity, snapshot(Unknown=1.0).rows[0].source_row_identity)
        self.assertNotEqual(snapshot(Price=1).rows[0].source_row_identity, snapshot(Price=True).rows[0].source_row_identity)
    def capture(self, transport, pages=None, **options):
        return collect_selected({**CONFIG, 'mode':'catalog-discovery', 'contracts':[]}, transport,
                                recapture_pages=[13] if pages is None else pages, **options)

    def test_targeted_page_is_followed_by_two_new_complete_passes(self):
        transport = FakeSelectedTransport(total=630)
        saved = []
        result = self.capture(transport, recapture_progress=saved.append)
        self.assertEqual(result['result'], 'complete')
        self.assertEqual(result['metrics']['reportRequests'], 26)
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved, result['recapture'])
        self.assertEqual(len(result['bundle']['discoveryBefore']), 13)
        self.assertEqual(len(result['bundle']['discoveryAfter']), 13)
        self.assertEqual(result['recapture'][0], result['bundle']['discoveryBefore'][12])
        self.assertEqual(transport.calls[1]['body']['sqlCdtn']['pageIndex'], 13)
        self.assertEqual(transport.calls[2]['body']['sqlCdtn']['pageIndex'], 1)

    def test_limits_do_not_expand_for_targeted_reads(self):
        result = self.capture(FakeSelectedTransport(total=1400), pages=[1])
        self.assertEqual(result['result'], 'complete')
        self.assertEqual(result['metrics']['reportRequests'], 56)
        self.assertEqual(len(result['bundle']['discoveryAfter']), 28)

    def test_targeted_timeout_and_http200_business_rejection_never_publish(self):
        for timeout in (False, True):
            def mutate(report, page, payload):
                if report:
                    if timeout:
                        raise NetworkAinuokeError('synthetic timeout')
                    payload['reObj']['isOk'] = False
            result = self.capture(FakeSelectedTransport(mutate, total=630))
            self.assertEqual(result['result'], 'failed')
            self.assertIsNone(result['bundle'])
            self.assertEqual(result['recapture'], [])

    def test_partial_targeted_evidence_survives_later_failure_but_cannot_be_published(self):
        count = [0]
        def mutate(report, page, payload):
            if report:
                count[0] += 1
                if count[0] == 2:
                    raise NetworkAinuokeError('synthetic timeout')
        result = self.capture(FakeSelectedTransport(mutate, total=630))
        self.assertEqual(result['result'], 'failed')
        self.assertIsNone(result['bundle'])
        self.assertEqual(len(result['recapture']), 1)

    def test_secret_reflection_is_rejected_before_targeted_progress_or_final_output(self):
        def mutate(report, page, payload):
            if report == 6086103:
                mutate_rows(payload, lambda rows: rows[0].update(Price=CONFIG['password']))
        saved = []
        result = self.capture(FakeSelectedTransport(mutate, total=630), recapture_progress=saved.append)
        self.assertEqual(result['result'], 'failed')
        self.assertEqual(saved, [])
        self.assertNotIn(CONFIG['password'], json.dumps(result))

    def test_invalid_targets_and_resumed_pages_are_not_accepted(self):
        for pages in ([1,1], [0], [29], ['1'], [True]):
            with self.assertRaises(ValueError):
                self.capture(FakeSelectedTransport(total=630), pages=pages)
