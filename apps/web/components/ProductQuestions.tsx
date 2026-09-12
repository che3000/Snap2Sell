"use client";
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogHeader} from "@/components/ui/dialog";
import {conditionQuestion} from "@/packages/product";
import type {Studio} from "../useStudio";
export function ProductQuestions({s}:{s:Studio}) {
 return <Dialog open={s.questionsOpen && !!s.p.pendingQuestions} onOpenChange={open=>{if(!s.busy)s.setQuestionsOpen(open)}}><DialogContent showCloseButton={!s.busy}><DialogHeader><DialogTitle>只需確認商品狀況</DialogTitle><DialogDescription>這件商品是新的嗎？選擇後會自動整理資訊，不需要回答品牌、電池容量或續航。</DialogDescription></DialogHeader><div className="actions">{["全新","拆封未使用","二手"].map(answer=><button key={answer} className="primary" disabled={!!s.busy} onClick={()=>s.answerQuestions([{question:conditionQuestion,answer}])}>{answer}</button>)}</div>{s.busy&&<p role="status">正在整理商品資訊…</p>}{s.error&&<p role="alert">{s.message}</p>}<p className="field-help">無法確認的規格會留空；二手商品的瑕疵可稍後補充。</p><button className="secondary" disabled={!!s.busy} onClick={()=>s.setQuestionsOpen(false)}>稍後選擇</button></DialogContent></Dialog>;
}
