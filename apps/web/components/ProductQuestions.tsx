"use client";
import {useState} from "react";
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogHeader} from "@/components/ui/dialog";
import {conditionQuestion} from "@/packages/product";
import type {Studio} from "../useStudio";
function QuestionForm({s}:{s:Studio}) {
 const questions=s.p.analysis?.questions || [];
 const [answers,setAnswers]=useState<Record<string,string>>({});
 const set=(q:string,a:string)=>setAnswers(old=>({...old,[q]:a}));
 return <><DialogHeader><DialogTitle>補充必要商品資訊</DialogTitle><DialogDescription>AI 已完成初步辨識，還有 {questions.length} 項資訊需要你確認。回答後會整理商品資料並查詢行情；不知道的內容可選「不確定」。</DialogDescription></DialogHeader>
 {s.p.analysis?.name && <p className="notice">初步辨識：{s.p.analysis.name}{s.p.analysis.identityConfidence!=="high_confidence"?'（待確認）':''}</p>}
 <form onSubmit={e=>{e.preventDefault();s.answerQuestions(questions.map(question=>({question,answer:answers[question]?.trim() || '不確定'})));}}>
 {questions.map((q,i)=><fieldset key={q} style={{border:0,padding:0,margin:'16px 0'}}><legend style={{fontWeight:600,marginBottom:8}}>{i+1}. {q}</legend>
 {q===conditionQuestion?<div className="actions">{['全新','拆封未使用','二手','不確定'].map(a=><button type="button" key={a} aria-pressed={answers[q]===a} className={answers[q]===a?'primary':'secondary'} disabled={!!s.busy} onClick={()=>set(q,a)}>{a}</button>)}</div>:<><input aria-label={q} value={answers[q] || ''} maxLength={1000} disabled={!!s.busy} onChange={e=>set(q,e.target.value)} placeholder="輸入答案，例如型號、容量或瑕疵狀況"/><button type="button" className="text-button" disabled={!!s.busy} onClick={()=>set(q,'不確定')}>不確定／不知道</button></>}
 </fieldset>)}
 {s.error&&<p role="alert">{s.message}</p>}
 <div className="actions"><button type="submit" className="primary" disabled={!!s.busy || questions.some(q=>!answers[q]?.trim())}>{s.busy?'正在整理商品資訊…':'確認並自動填入'}</button><button type="button" className="secondary" disabled={!!s.busy} onClick={()=>s.setQuestionsOpen(false)}>稍後回答</button></div>
 </form></>;
}
export function ProductQuestions({s}:{s:Studio}) {
 return <Dialog open={s.questionsOpen && !!s.p.pendingQuestions} onOpenChange={open=>{if(!s.busy)s.setQuestionsOpen(open)}}><DialogContent showCloseButton={!s.busy} style={{maxHeight:'85vh',overflowY:'auto'}}><QuestionForm key={s.p.id+JSON.stringify(s.p.analysis?.questions)} s={s}/></DialogContent></Dialog>;
}
