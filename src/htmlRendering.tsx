import { transpileCode } from './codeTranspliation';
import { attachOnDomElLoaded } from './componentRendering';

let oldDomPurifySanitize = null;

export function patchSanitization() {
    oldDomPurifySanitize = (global as any).DOMPurify.sanitize;

    (global as any).DOMPurify.sanitize = (html, config) => {
        const pureHtml = oldDomPurifySanitize(html, { ...config, RETURN_DOM_FRAGMENT: false });
        const isPureHtml = new DOMParser().parseFromString(html, 'text/xml').documentElement.outerHTML == pureHtml;

        const container = document.createElement('span');

        const isValidReactCode = (() => {
            try {
                transpileCode(html);
                return true;
            } catch (e) {
                return false;
            }
        })();

        if (!isPureHtml && isValidReactCode) {
            attachOnDomElLoaded(html, container);
            return container;
        } else {
            return oldDomPurifySanitize(html, config);
        }
    };
}

export function unpatchSanitization() {
    if (oldDomPurifySanitize) {
        (global as any).DOMPurify.sanitize = oldDomPurifySanitize;
    }
}
