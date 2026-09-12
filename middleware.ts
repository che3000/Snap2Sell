import {servicesDisabled,stoppedResponse} from './packages/shared/service-status';
export function middleware() {
 if(servicesDisabled())return stoppedResponse();
}
export const config = {matcher:'/:path*'};
