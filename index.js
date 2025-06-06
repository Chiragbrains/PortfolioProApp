// import { registerRootComponent } from 'expo';
// import App from './App.js';  // Make sure to use the explicit .js extension

// // registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// // It also ensures that whether you load the app in Expo Go or in a native build,
// // the environment is set up appropriately
// registerRootComponent(App);
// index.js or similar entry point
import { registerRootComponent } from 'expo';
import AppWrapper from './AppWrapper';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(AppWrapper);