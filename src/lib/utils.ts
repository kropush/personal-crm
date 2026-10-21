import { createCn } from "cn/config";

// Our own design tokens from globals.css. Without this list cn() takes
// `text-title` for a text color and drops it next to `text-muted-foreground`.
export const cn = createCn({
  extend: {
    theme: {
      text: ["title", "subtitle", "logo", "label"],
      tracking: ["label"],
      radius: ["card", "logo"],
      shadow: ["card", "contact"],
    },
  },
});
