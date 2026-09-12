/** Global kill switch: checked before authentication, storage, or external service calls. */
export const servicesDisabled = () => process.env.SERVICES_DISABLED === 'true';
export function stoppedResponse() {
 return new Response('Snap2Sell 服務已停用。所有商品操作、AI 與市場查價暫停。', {
  status:503, headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}
 });
}
