import { requireNativeModule } from 'expo-modules-core';
import { Linking as RNLinking } from 'react-native';

type NativeLinkingType = {
  getLinkingURL(): string | null;
  clearLinkingURL(): void;
};

// It loads the native module object from the JSI or falls back to
// the bridge module (from NativeModulesProxy) if the remote debugger is on.
const NativeLinking = requireNativeModule('ExpoLinking');

Object.assign(NativeLinking, RNLinking);

export default NativeLinking as NativeLinkingType & typeof RNLinking;
