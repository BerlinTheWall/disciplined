/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";

import { spring, tap } from "@/lib/motion";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean; // styles the confirm button as a red, irreversible action
}

export interface ChoiceOption {
  label: string;
  value: string;
  destructive?: boolean; // styles this choice as a red, irreversible action
}

export interface ChooseOptions {
  title: string;
  message?: string;
  options: ChoiceOption[]; // rendered as a vertical stack of buttons
  cancelLabel?: string;
}

export interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  choose: (options: ChooseOptions) => Promise<string | null>;
  // Resolves the typed text (trimmed), or null if cancelled / dismissed.
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmApi | null>(null);

// Two-button yes/no prompt. Resolves true (confirmed) or false (cancelled).
// Guard an action in one line: `if (!(await confirm({ ... }))) return`.
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx.confirm;
}

// Multi-option prompt. Resolves the chosen option's `value`, or null if cancelled.
export function useChoose() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useChoose must be used within a ConfirmProvider");
  return ctx.choose;
}

// Single text-input prompt. Resolves the typed string, or null if cancelled.
export function usePrompt() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("usePrompt must be used within a ConfirmProvider");
  return ctx.prompt;
}

type Pending =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "choose"; options: ChooseOptions; resolve: (v: string | null) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (v: string | null) => void };

const PRIMARY_BTN = "w-full rounded-xl py-2.5 font-medium bg-surface-inverse text-fg-inverse";
const DESTRUCTIVE_BTN = "w-full rounded-xl py-2.5 font-medium bg-red-500 text-white";
const CANCEL_BTN = "w-full rounded-xl py-2.5 font-medium bg-surface-raised text-fg";

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [promptText, setPromptText] = useState("");

  const confirm = useCallback<ConfirmApi["confirm"]>(
    (options) =>
      new Promise<boolean>((resolve) => setPending({ kind: "confirm", options, resolve })),
    []
  );

  const choose = useCallback<ConfirmApi["choose"]>(
    (options) =>
      new Promise<string | null>((resolve) => setPending({ kind: "choose", options, resolve })),
    []
  );

  const prompt = useCallback<ConfirmApi["prompt"]>(
    (options) =>
      new Promise<string | null>((resolve) => {
        setPromptText(options.defaultValue ?? "");
        setPending({ kind: "prompt", options, resolve });
      }),
    []
  );

  // Resolve the open prompt and close it. `result` matches the pending kind:
  // boolean for confirm, string|null for choose.
  function close(result: boolean | string | null) {
    setPending((curr) => {
      if (curr) (curr.resolve as (v: boolean | string | null) => void)(result);
      return null;
    });
  }

  // The value a dismissal (overlay tap / cancel) resolves to for each kind.
  const dismissValue = pending?.kind === "confirm" ? false : null;

  return (
    <ConfirmContext.Provider value={{ confirm, choose, prompt }}>
      {children}
      {createPortal(
        <AnimatePresence>
          {pending && (
            <>
              <motion.div
                className="fixed inset-0 bg-black/40 z-60"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => close(dismissValue)}
              />
              <div className="fixed inset-0 z-70 flex items-center justify-center p-6 pointer-events-none">
                <motion.div
                  role="alertdialog"
                  className="w-full max-w-xs bg-surface rounded-2xl shadow-xl p-5 pointer-events-auto"
                  initial={{ opacity: 0, scale: 0.92, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 8 }}
                  transition={spring.snappy}
                >
                  <h3 className="text-lg font-semibold text-fg">{pending.options.title}</h3>
                  {pending.options.message && (
                    <p className="text-sm text-fg-muted mt-1.5 leading-snug">
                      {pending.options.message}
                    </p>
                  )}

                  {pending.kind === "confirm" && (
                    <div className="flex gap-2 mt-5">
                      <motion.button
                        onClick={() => close(false)}
                        whileTap={tap}
                        className={CANCEL_BTN}
                      >
                        {pending.options.cancelLabel ?? "Cancel"}
                      </motion.button>
                      <motion.button
                        onClick={() => close(true)}
                        whileTap={tap}
                        className={pending.options.destructive ? DESTRUCTIVE_BTN : PRIMARY_BTN}
                      >
                        {pending.options.confirmLabel ?? "Confirm"}
                      </motion.button>
                    </div>
                  )}

                  {pending.kind === "choose" && (
                    <div className="flex flex-col gap-2 mt-5">
                      {pending.options.options.map((opt) => (
                        <motion.button
                          key={opt.value}
                          onClick={() => close(opt.value)}
                          whileTap={tap}
                          className={opt.destructive ? DESTRUCTIVE_BTN : PRIMARY_BTN}
                        >
                          {opt.label}
                        </motion.button>
                      ))}
                      <motion.button
                        onClick={() => close(null)}
                        whileTap={tap}
                        className={CANCEL_BTN}
                      >
                        {pending.options.cancelLabel ?? "Cancel"}
                      </motion.button>
                    </div>
                  )}

                  {pending.kind === "prompt" && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        close(promptText.trim());
                      }}
                    >
                      <input
                        type="text"
                        autoFocus
                        value={promptText}
                        onChange={(e) => setPromptText(e.target.value)}
                        placeholder={pending.options.placeholder}
                        className="w-full mt-4 bg-surface-raised rounded-xl px-3.5 py-2.5 text-fg placeholder-fg-faint focus:outline-none"
                      />
                      <div className="flex gap-2 mt-4">
                        <motion.button
                          type="button"
                          onClick={() => close(null)}
                          whileTap={tap}
                          className={CANCEL_BTN}
                        >
                          {pending.options.cancelLabel ?? "Cancel"}
                        </motion.button>
                        <motion.button type="submit" whileTap={tap} className={PRIMARY_BTN}>
                          {pending.options.confirmLabel ?? "OK"}
                        </motion.button>
                      </div>
                    </form>
                  )}
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </ConfirmContext.Provider>
  );
}
