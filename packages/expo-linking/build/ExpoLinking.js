import { requireNativeModule } from 'expo-modules-core';
import { Linking as RNLinking } from 'react-native';
// It loads the native module object from the JSI or falls back to
// the bridge module (from NativeModulesProxy) if the remote debugger is on.
const NativeLinking = requireNativeModule('ExpoLinking');
Object.assign(NativeLinking, RNLinking);
export default NativeLinking;
//# sourceMappingURL=ExpoLinking.js.map