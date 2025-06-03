// module.exports = function (api) {
//   api.cache(true);
//   return {
//     presets: ['module:metro-react-native-babel-preset'],
//     plugins: [
//       ['module:react-native-dotenv', {
//         moduleName: '@env',
//         path: '.env',
//         blacklist: null,
//         whitelist: null,
//         safe: false,
//         allowUndefined: true
//       }],
//       ['module-resolver', {
//         root: ['./'],
//         extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
//         alias: {
//           '@services': './services',
//           '@components': './components'
//         }
//       }]
//     ]
//   };
// };

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module:react-native-dotenv', {
        moduleName: '@env',
        path: '.env',
        blacklist: null,
        whitelist: null,
        safe: false,
        allowUndefined: true
      }],
      '@babel/plugin-transform-modules-commonjs' // Explicitly transform ES modules to CommonJS
    ]
  };
};