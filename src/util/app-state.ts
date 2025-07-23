import { inject, provide, ref, type Ref } from 'vue';

// Define the shared state interface
interface AppState {
  speakerListSearch: Ref<string>;
  applyIir: Ref<boolean>;
  showNormalized: Ref<boolean>;
}

// Create reactive state
const state = {
  speakerListSearch: ref(''),
  applyIir: ref(false),
  showNormalized: ref(false),
};

// Provide function
export function provideAppState() {
  provide('appState', state);
}

// Inject function
export function useAppState() {
  const appState = inject<AppState>('appState');
  if (!appState) {
    throw new Error('useAppState must be used within a provideAppState context');
  }
  return appState;
}