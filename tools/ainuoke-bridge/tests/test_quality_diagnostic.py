from unittest import TestCase, main
from unittest.mock import patch
from ainuoke_bridge.server_source import collect, validate_input
from ainuoke_bridge.ainuoke_client import AinuokeLoginSession, ReportPage

CONFIG={"baseUrl":"https://example.invalid","username":"synthetic","password":"never-reflect-secret","contracts":[],"mode":"quality",
        "qualityTargets":[{"salesContractNo":"SC-1","colors":True,"materials":True}]}
class Client:
    def __init__(self): self.calls=[]
    def login(self,*args): return AinuokeLoginSession("fake-token","fake-session")
    def read_report(self,definition,*,jwt_token,page,page_size,query_context):
        self.calls.append((int(definition.report_id),query_context))
        rows=[{"BillNo":"SC-1","InsideOrderNo":"IN-CURRENT"}] if int(definition.report_id)==6086103 else []
        return ReportPage(rows,len(rows),page,page_size)
class QualityTests(TestCase):
    def test_fixed_report_exact_scope_current_inside_identity_and_stable_discovery(self):
        client=Client()
        with patch("time.sleep"): result=collect(CONFIG,client)
        self.assertEqual(result["schemaVersion"],"ainuoke-quality-diagnostic.v1")
        self.assertEqual(client.calls,[(6086103,{}),(6087105,{"salesContractNo":"SC-1"}),(6087050,{"insideOrderNo":"IN-CURRENT"}),(6086103,{})])
        self.assertEqual(result["reportRequests"],4)
        self.assertNotIn(CONFIG["password"],str(result))
    def test_scope_limits_duplicates_flags_and_mode_isolation(self):
        variants=[{"qualityTargets":[]},{"qualityTargets":CONFIG["qualityTargets"]*2},{"qualityTargets":[{"salesContractNo":"SC-1","colors":False,"materials":False}]},
                  {"qualityTargets":[{"salesContractNo":f"SC-{i}","colors":True,"materials":False} for i in range(7)]},
                  {"qualityTargets":[{"salesContractNo":f"SC-{i}","colors":False,"materials":True} for i in range(19)]},
                  {"mode":"discovery"},{"contracts":["SC-1"]}]
        for change in variants:
            with self.subTest(change=change),self.assertRaises(ValueError):validate_input({**CONFIG,**change})
if __name__=="__main__": main()
