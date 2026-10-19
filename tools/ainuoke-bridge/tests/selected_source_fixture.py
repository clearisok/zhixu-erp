"""Synthetic actual-SDK transport; never connects to a host or reads credentials."""
import json


class FakeSelectedTransport:
    def __init__(self, mutate=None, total=3, detail_total=1):
        self.calls = []
        self.mutate = mutate
        self.total, self.detail_total = total, detail_total
        self.discovery_pass = 0

    def request(self, **request):
        self.calls.append(request)
        if request["method"] == "GET":
            payload = {"data": {"isOk": True, "jwtToken": "synthetic-token-value", "sessionId": "synthetic-session-value"}}
            if self.mutate:
                self.mutate(0, 0, payload)
            return payload
        body = request["body"]
        report, page = int(body["reportId"]), body["sqlCdtn"]["pageIndex"]
        if report == 6086103:
            if page == 1:
                self.discovery_pass += 1
            total = self.total
            rows = [{"id": str(i), "BillNo": f"SYN-SALES-{i}", "InsideOrderNo": f"SYN-IN-{i}",
                     "GoodsDesc": f"SYN-STYLE-{i}", "Num": 100, "Status": "生效", "CustomerName": "合成客户",
                     "CompanyName": "合成公司", "Brand": "合成品牌", "ContractDate": "2026-10-01",
                     "DeliveryDate": "2026-11-01"} for i in range(1, total+1)]
        else:
            value = body["sqlCdtn"]["conditionList"][0]["compareValue"]
            i = int(value.rsplit("-", 1)[1])
            total = self.detail_total
            if report == 6087105:
                rows = [{"id": f"{i}-{j}", "BillNo": f"SYN-SALES-{i}", "insideorderno": f"SYN-IN-{i}",
                         "GoodsNo": f"SYN-STYLE-{i}", "CnColor": "合成蓝", "SizeNum": 100,
                         "DeliveryDate": "2026-11-01", "SizeRule": "M,L", "Size1": 40, "Size2": 60}
                        for j in range(total)]
            else:
                rows = [{"id": f"{i}-{j}", "ExpContractNo": f"SYN-SALES-{i}", "insideorderno": f"SYN-IN-{i}",
                         "styleno": f"SYN-STYLE-{i}", "GoodsNo": f"SYN-MATERIAL-{i}-{j}", "CnName": "合成线",
                         "lx": "辅料", "CnColor": "合成蓝", "CnComposition": "合成规格", "StyleColor": "合成蓝",
                         "StyleNum": 100, "TotalNum": "115.50", "QtyUnit": "个", "SupplyType": "自购",
                         "cgnum": 118, "cgdh": f"SYN-PO-{i}-{j}", "cgrq": "2026-10-01", "SupplierName": "合成供应商",
                         "rknum": 118, "rkdh": f"SYN-INBOUND-{i}-{j}", "rkrq": "2026-10-02", "num_dyc": 1,
                         "CYNum": 118, "cydh": f"SYN-SHIP-{i}-{j}", "cyrq": "2026-10-03",
                         "OutStoreNum": 118, "ckdh": f"SYN-OUT-{i}-{j}", "ckrq": "2026-10-04"}
                        for j in range(total)]
        rows = rows[(page-1)*50:page*50]
        payload = {"reObj": {"isOk": True}, "dataList": json.dumps({"rows": rows}, ensure_ascii=False),
                   "dataCount": total, "pageIndex": 0, "pageSize": 0}
        if self.mutate:
            self.mutate(report, page, payload)
        return payload


def mutate_rows(payload, mutate):
    rows = json.loads(payload["dataList"])["rows"]
    mutate(rows)
    payload["dataList"] = json.dumps({"rows": rows}, ensure_ascii=False)
