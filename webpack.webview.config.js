const path = require("path");

module.exports = {
  mode: "development",
  target: "web",
  entry: {
    sidebar: "./webview-ui/src/Sidebar.jsx",
    editor: "./webview-ui/src/Editor.jsx",
    "config-panel": "./webview-ui/src/ConfigPanel.jsx",
    "usage-dashboard": "./webview-ui/src/UsageDashboard.jsx",
    "review-panel": "./webview-ui/src/ReviewPanel.jsx",
  },
  output: {
    path: path.resolve(__dirname, "webview-ui/dist"),
    filename: "[name].js",
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [
              "@babel/preset-env",
              ["@babel/preset-react", { runtime: "automatic" }],
            ],
          },
        },
      },
    ],
  },
  resolve: {
    extensions: [".js", ".jsx"],
  },
  devtool: "source-map",
};
