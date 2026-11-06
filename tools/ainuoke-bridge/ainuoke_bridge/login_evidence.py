"""Closed login evidence shared by diagnostics and the real collector. No raw values."""
from collections.abc import Mapping

# Exact, closed message matches only. Unknown/dynamic text is never returned.
HINTS = {
    "session_exists": ("用户已登录", "该用户已登录", "用户已经登录", "该用户已经登录",
                       "此用户已登录", "账号已登录", "帐号已登录", "账户已登录",
                       "该账号已登录", "该帐号已登录", "该账户已登录", "already logged in"),
    "verification_required": ("验证码错误", "请输入验证码", "验证码不能为空", "验证码已过期", "captcha required"),
    "credentials_rejected": ("用户名或密码错误", "用户名或密码不正确", "账号或密码错误",
                             "用户名不存在", "密码错误", "invalid username or password"),
    "account_unavailable": ("用户已锁定", "用户被锁定", "账号已锁定", "账号被锁定",
                            "用户已禁用", "账号已禁用", "账号已停用", "account locked", "account disabled"),
    "throttling_hint": ("请求过于频繁", "访问过于频繁", "操作过于频繁", "登录过于频繁", "too many requests"),
}

def login_evidence(response):
    data = response.get("data") if isinstance(response, Mapping) else None
    shape = ("data_object" if isinstance(data, Mapping) else
             "object_without_data_object" if isinstance(response, Mapping) else "non_object")
    result = ("accepted" if isinstance(data, Mapping) and data.get("isOk") is True else
              "rejected" if isinstance(data, Mapping) and data.get("isOk") is False else "malformed")
    hint, code = "unclassified", "absent"
    if isinstance(data, Mapping) and "text1" in data:
        value = data["text1"]
        code = "cover_confirmation" if type(value) in (str, int) and value in ("-2", -2) else "unrecognized"
    if result == "rejected":
        matches = set()
        for obj in (response, data):
            for key in ("message", "msg", "errMsg", "errorMsg"):
                value = obj.get(key)
                if not isinstance(value, str) or len(value) > 256:
                    continue
                normalized = value.strip().rstrip("。.!！").casefold()
                for category, messages in HINTS.items():
                    if normalized in messages:
                        matches.add(category)
        if len(matches) == 1:
            hint = next(iter(matches))
        if code == "cover_confirmation":
            hint = "cover_confirmation_required" if matches <= {"session_exists"} else "unclassified"
    return {"responseShape": shape, "result": result, "serverCode": code, "serverHint": hint}
