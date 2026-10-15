import json
from hashlib import sha256
from unittest import TestCase
from unittest.mock import patch

from ainuoke_bridge.payment_request_observations import extract_payment_observation_page, PaymentObservationError

def capture(inner='{"rows":[{"id":1,"Num":10,"OutStoreNum":12}]}', encoded=False):
    raw='{"reObj":{"isOk":true},"dataList":'+(json.dumps(inner) if encoded else inner)+',"reportObj":{"reportId":6086941},"dataCount":1000,"pageIndex":0,"pageSize":0}'
    return {"schemaVersion":"ainuoke-payment-request-private.v1","reportId":"6086941","page":1,"pageSize":100,
            "sourceFingerprint":"a"*64,"capturedAt":"2026-10-15T09:00:00Z","rawReportResponse":raw,"rawResponseSha256":sha256(raw.encode()).hexdigest()}

def reseal(value):
    value["rawResponseSha256"]=sha256(value["rawReportResponse"].encode()).hexdigest()
    return value

class PaymentObservationTests(TestCase):
    def test_lossless_numbers_object_or_encoded_rows(self):
        inner='{"rows":[{"id":9007199254740993,"Price":12345678901234567890.12345678901234567890,"tzamount":-1.00,"CnName":"合成","Num":0,"YFAmount":null}]}'
        for encoded in (True,False):
            row=extract_payment_observation_page(capture(inner,encoded))["rows"][0]
            self.assertEqual(row,{"id":"9007199254740993","Price":"12345678901234567890.12345678901234567890","tzamount":"-1.00","CnName":"合成","Num":"0","YFAmount":None})
            self.assertNotIn("GoodsAmount",row)
    def test_duplicate_json_keys_rejected_instead_of_losing_identity_or_quantity(self):
        for inner in ('{"rows":[{"id":1,"Num":1,"Num":2}]}','{"rows":[{"id":1,"\\u004eum":1,"Num":2}]}'):
            for encoded in (True,False):
                with self.assertRaisesRegex(PaymentObservationError,"duplicate_json_key"):
                    extract_payment_observation_page(capture(inner,encoded))
    def test_duplicate_source_rows_preserved(self):
        rows=extract_payment_observation_page(capture('{"rows":[{"id":1,"Num":10},{"id":1,"Num":10}]}'))["rows"]
        self.assertEqual(len(rows),2);self.assertEqual(rows[0],rows[1])
    def test_changed_hash_and_wrong_scope_rejected(self):
        for changes in ({"rawResponseSha256":"0"*64},{"page":2},{"page":True},{"pageSize":50},{"reportId":"6087050"},{"sourceFingerprint":"invalid"}):
            item=capture();item.update(changes)
            with self.subTest(changes=changes),self.assertRaises(PaymentObservationError):
                extract_payment_observation_page(item)
    def test_wrong_report_and_paging_rejected(self):
        for old,new in (('"reportId":6086941','"reportId":6087050'),('"pageIndex":0','"pageIndex":2'),('"pageSize":0','"pageSize":50'),('"dataCount":1000','"dataCount":null'),('"dataCount":1000','"dataCount":true')):
            item=capture();item["rawReportResponse"]=item["rawReportResponse"].replace(old,new)
            with self.subTest(new=new),self.assertRaises(PaymentObservationError):
                extract_payment_observation_page(reseal(item))
    def test_secret_nonflat_nonfinite_and_wrong_row_shape_rejected(self):
        for inner in ('{"rows":[{"password":"synthetic"}]}','{"rows":[{"Num":NaN}]}','{"rows":[{"Num":true}]}','{"rows":[{"Num":{"nested":1}}]}','{"rows":[null]}'):
            with self.subTest(inner=inner),self.assertRaises(ValueError):
                extract_payment_observation_page(capture(inner))
    def test_null_is_not_zero_and_total_info_is_not_imported(self):
        item=capture('{"rows":[{"YFAmount":null,"OutStoreNum":0}]}')
        result=extract_payment_observation_page(item)
        self.assertEqual(result["rows"][0],{"YFAmount":None,"OutStoreNum":"0"})
        self.assertNotIn("currency",result);self.assertNotIn("totalInfo",result)
    def test_no_network_database_or_credential_access(self):
        with patch("ainuoke_bridge.ainuoke_client.AinuokeClient.login",side_effect=AssertionError("unexpected login")),patch("builtins.open",side_effect=AssertionError("unexpected IO")):
            self.assertEqual(extract_payment_observation_page(capture())["reportId"],"6086941")
    def test_reported_total_and_row_limit(self):
        item=capture(json.dumps({"rows":[{}]*101}))
        with self.assertRaises(PaymentObservationError):extract_payment_observation_page(item)
        item=capture();item["rawReportResponse"]=item["rawReportResponse"].replace('"dataCount":1000','"dataCount":0')
        with self.assertRaises(PaymentObservationError):extract_payment_observation_page(reseal(item))
