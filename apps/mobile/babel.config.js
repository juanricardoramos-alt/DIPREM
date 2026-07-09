module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // Debe ser el último plugin (requisito de reanimated)
    plugins: ["react-native-reanimated/plugin"],
  };
};
