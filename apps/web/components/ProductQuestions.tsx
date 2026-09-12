"use client";
import {useState} from "react";
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogHeader} from "@/components/ui/dialog";
import type {Studio} from "../useStudio";
export function ProductQuestions({s}:{s:Studio}) {
 const questions=s.p.analysis?.questions || [];
 const [answers,setAnswers]=useState<Record<string,string>>({});
 return <Dialog open={s.questionsOpen && !!s.p.pendingQuestions} onOpenChange={open=>{if(!s.busy)s.setQuestionsOpen(open)}}><DialogContent style={{maxHeight:"85vh",overflowY:"auto"}} showCloseButton={!s.busy}><DialogHeader><DialogTitle>補充商品資訊</DialogTitle><DialogDescription>回答以下問題後，AI 會整理商品欄位、文案與建議售價。不確定的內容可以回答「不知道」。</DialogDescription></DialogHeader><form onSubmit={e=>{e.preventDefault();void s.answerQuestions(questions.map(question=>({question,answer:(answers[question] || '').trim()})))}}>{questions.map((question,i)=><label key={question}>{i+1}. {question}<textarea rows={3} maxLength={1000} required disabled={!!s.busy} value={answers[question] || ''} onChange={e=>setAnswers({...answers,[question]:e.target.value})} placeholder="例如：二手，使用半年，功能正常，外殼有小刮痕"/></label>)}{s.error&&<p role="alert">{s.message}</p>}<div className="actions"><button className="primary" disabled={!!s.busy || questions.some(q=>!answers[q]?.trim())}>{s.busy?'正在整理回答…':'送出回答並自動填入'}</button><button type="button" className="secondary" disabled={!!s.busy} onClick={()=>s.setQuestionsOpen(false)}>稍後回答</button></div></form></DialogContent></Dialog>;
}
