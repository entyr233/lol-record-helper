import js from "@eslint/js";
import globals from "globals";
import pluginVue from "eslint-plugin-vue";
import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";

export default defineConfigWithVueTs(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "userscript/lol-tft.user.js",
      "userscript/lol-tft-ui.js",
      "docs/**",
      "sample/**",
      "coverage/**"
    ]
  },
  js.configs.recommended,
  pluginVue.configs["flat/recommended"],
  vueTsConfigs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "vue/multi-word-component-names": "off",
      // 排版类规则交给现有代码风格，避免一次重排整个仓库
      "vue/max-attributes-per-line": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/html-self-closing": "off",
      "vue/html-indent": "off",
      "vue/attributes-order": "off",
      "vue/first-attribute-linebreak": "off",
      "vue/html-closing-bracket-newline": "off",
      "vue/multiline-html-element-content-newline": "off"
    }
  },
  {
    files: ["tests/**/*.ts", "dev/**/*.ts", "scripts/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node }
    },
    rules: {
      "vue/one-component-per-file": "off",
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
);
