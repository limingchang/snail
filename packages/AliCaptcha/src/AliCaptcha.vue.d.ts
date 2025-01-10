import { PropType } from 'vue';
import { CaptchaConfig, CaptchaHandle } from './type';
declare global {
    interface Window {
        initAlicom4: (config: CaptchaConfig, handler: CaptchaHandle) => void;
    }
}
declare const _default: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    captchaId: {
        type: StringConstructor;
        required: true;
    };
    handle: {
        type: PropType<CaptchaHandle>;
        required: true;
    };
}>, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    captchaId: {
        type: StringConstructor;
        required: true;
    };
    handle: {
        type: PropType<CaptchaHandle>;
        required: true;
    };
}>> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export default _default;
