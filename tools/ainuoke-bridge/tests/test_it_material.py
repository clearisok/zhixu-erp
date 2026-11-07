import json
import unittest
from ainuoke_bridge.selected_source_once import collect_selected
from ainuoke_bridge.server_source import validate_input
from selected_source_fixture import FakeSelectedTransport

CONFIG = {"baseUrl": "https://example.invalid", "username": "synthetic", "password": "synthetic-secret-value",
          "contracts": ["SYN-SALES-1"], "mode": "catalog-contracts", "materialReport": "6087051"}


def mutate_it(report, page, payload):
    if report == 6087051:
        payload['dataList'] = json.dumps({'rows': [dict(id=35776, ExpContractNo='SYN-SALES-1', insideorderno='SYN-OLD-1',
            styleno='SYN-STYLE-1', lx='面料', GoodsNo='SYN-FABRIC', CnName='合成面料', TotalNum=937,
            cgid=6031, cgmxid=31711, cgdh='SYN-PO', cgnum=952, rkid=8919, rkmxid=35631+i,
            rkdh='SYN-IN', rknum=n, cydh=None, CYNum=None, ckdh=None, OutStoreNum=None)
            for i, n in enumerate([418.7, 349.3, 213])]}, ensure_ascii=False)
        payload['dataCount'] = 3
        payload['sumData'] = {'cgnum': 999999}  # must not be carried into a snapshot
    elif report == 6086405:
        payload['dataList'] = json.dumps({'rows': [dict(id=31711, PurContractID=6031, PurContractNo='SYN-PO', OrderNum=952, QtyUnit='千克')]})
        payload['dataCount'] = 1
    elif report == 6086875:
        payload['dataList'] = json.dumps({'rows': [dict(id=35631+i, MainID=8919, FInStoreNo='SYN-IN', Num=n, QtyUnit='千克')
            for i,n in enumerate([418.7,349.3,213])]})
        payload['dataCount'] = 3


def capture():
    transport = FakeSelectedTransport(mutate=mutate_it)
    return collect_selected(CONFIG, transport), transport


class ItMaterialTests(unittest.TestCase):
    def test_contract_then_exact_unit_lookups_no_header_totals(self):
        result, transport = capture()
        self.assertEqual(result['result'], 'complete')
        self.assertEqual(result['metrics']['logins'], 1)
        self.assertEqual(result['metrics']['reportRequests'], 6)
        reports = [c['body']['reportId'] for c in transport.calls[1:]]
        self.assertEqual(reports, [6086103, 6087105, 6087051, 6086875, 6086405, 6086103])
        q = transport.calls[3]['body']['sqlCdtn']['conditionList'][0]
        self.assertEqual((q['fieldName'], q['compareType'], q['compareValue']), ('ExpContractNo', 'contains', 'SYN-SALES-1'))
        self.assertNotIn('sumData', json.dumps(result))
        self.assertNotIn('999999', json.dumps(result))
        self.assertTrue(all(c['body']['sqlCdtn']['conditionList'][0]['compareValue']=='SYN-OLD-1' for c in transport.calls[4:6]))

    def test_cross_contract_stops_before_dependent_reads(self):
        def mutate(report,page,payload):
            mutate_it(report,page,payload)
            if report==6087051:
                data=json.loads(payload['dataList']);data['rows'][0]['ExpContractNo']='OTHER';payload['dataList']=json.dumps(data)
        transport=FakeSelectedTransport(mutate=mutate)
        result=collect_selected(CONFIG,transport)
        self.assertEqual(result['result'],'failed')
        self.assertEqual(result['metrics']['reportRequests'],3)

    def test_legacy_configuration_still_uses_6087050(self):
        cfg={k:v for k,v in CONFIG.items() if k!='materialReport'}
        transport=FakeSelectedTransport();result=collect_selected(cfg,transport)
        self.assertEqual(result['result'],'complete')
        self.assertEqual([c['body']['reportId'] for c in transport.calls[1:]], [6086103,6087105,6087050,6086103])

    def test_reject_arbitrary_reports_or_unbounded_modes(self):
        for cfg in [{**CONFIG,'materialReport':'123'}, {**CONFIG,'mode':'audit'}, {**CONFIG,'mode':'selected-bindings'}]:
            with self.assertRaises(ValueError): validate_input(cfg)


if __name__ == '__main__':
    unittest.main()
