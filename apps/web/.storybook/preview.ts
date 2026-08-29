import type { Preview } from "@storybook/react-vite";
import "@nexus/ui/tokens.css";
import "../src/styles.css";

const preview: Preview = {
  parameters: {
    a11y: { test: "error" },
    backgrounds: { default: "operations" },
    layout: "centered",
  },
};

export default preview;
