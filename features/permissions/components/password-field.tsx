"use client";
import {useState} from "react";
import {passwordValidationMessage} from "../model/password-policy";
export function PasswordField({value,onChange,disabled=false}:{value:string;onChange(value:string):void;disabled?:boolean}){
 const [visible,setVisible]=useState(false),error=value?passwordValidationMessage(value):null;
 return <div className="qc-admin-password"><label><span>新密码（至少6个字符）</span><div className="qc-admin-password-input"><input className="qc-control" type={visible?"text":"password"} autoComplete="new-password" value={value} disabled={disabled} aria-invalid={Boolean(error)} onChange={e=>onChange(e.target.value)}/><button type="button" disabled={disabled} aria-label={visible?"隐藏密码":"显示密码"} onClick={()=>setVisible(!visible)}>{visible?"隐藏":"显示"}</button></div></label><small>不要求数字、字母或特殊字符组合。</small>{error&&<p role="alert">{error}</p>}</div>;
}

