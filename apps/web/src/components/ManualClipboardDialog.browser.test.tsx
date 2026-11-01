import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { act, render } from "../../test/render";
import { manualClipboard } from "../manualClipboard";
import { ManualClipboardDialog } from "./ManualClipboardDialog";

it("offers exact failed text for selection, updates on the next failure, and discards it on close", async () => {
  manualClipboard.clear();
  using _clipboard = { [Symbol.dispose]: () => manualClipboard.clear() };
  // The clipboard store is independent of routing.
  await using screen = await render(<ManualClipboardDialog />, { router: false });
  await act(() => manualClipboard.reveal("虚构 HTTP 复制\n保留换行"));
  const textarea = document.querySelector(
    'textarea[aria-label="手动复制内容"]',
  )! as HTMLTextAreaElement;
  expect(textarea.value).toBe("虚构 HTTP 复制\n保留换行");
  using select = vi.spyOn(textarea, "select");
  textarea.blur();
  await page.getByRole("textbox", { name: "手动复制内容" }).click();
  expect(select).toHaveBeenCalledOnce();
  await act(() => manualClipboard.reveal("下一次虚构内容"));
  expect(textarea.value).toBe("下一次虚构内容");
  await userEvent.keyboard("{Escape}");
  expect(manualClipboard.getSnapshot()).toBeNull();
  await screen.unmount();
});
