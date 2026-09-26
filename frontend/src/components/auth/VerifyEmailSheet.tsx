import { useEffect, useState } from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { motion } from "framer-motion";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import * as yup from "yup";
import { useShallow } from "zustand/shallow";

import BottomSheet from "@/components/BottomSheet";
import { FormInputs } from "@/components/form";
import { INPUT_TYPE } from "@/constants/input-type";
import { ApiError } from "@/lib/api";
import { tap } from "@/lib/motion";
import { useAuthStore } from "@/store/authStore";
import { useVerifyEmailStore } from "@/store/verifyEmailStore";
import type { FormInputTypes } from "@/types/input-types";

const schema = yup.object({
  code: yup
    .string()
    .label("Verification code")
    .required()
    .length(6, "Code must be exactly 6 digits")
    .default(""),
});
type FormSchemaType = yup.InferType<typeof schema>;

const Inputs: FormInputTypes[] = [
  {
    inputType: INPUT_TYPE.NUMBER,
    name: "code",
    placeholder: "123456",
    maxLength: 6,
    props: {
      autoComplete: "one-time-code",
      className: "tracking-[0.3em] text-center",
    },
  },
];

// Verification is a hard gate on login (see routers/auth.py) — this sheet is
// the one way in for an unverified account, reached either right after
// signup or when a login attempt comes back 403. Success logs the user
// straight in (verifyEmail returns a fresh token), same as ForgotPasswordSheet.
export default function VerifyEmailSheet() {
  const [isOpen, email, autoSendOnOpen, message, handleClose] = useVerifyEmailStore(
    useShallow((state) => [
      state.show,
      state.email,
      state.autoSendOnOpen,
      state.message,
      state.handleClose,
    ])
  );

  const verifyEmail = useAuthStore((s) => s.verifyEmail);
  const resendVerification = useAuthStore((s) => s.resendVerification);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const {
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting },
    watch,
  } = useForm<FormSchemaType>({
    resolver: yupResolver(schema),
    defaultValues: schema.getDefault(),
  });

  // Adjust state during render (rather than in the effect below) for the
  // synchronous "about to auto-send" reset — the effect is left to do only
  // the actual async call and its own promise-callback state updates, which
  // is the part React's rules actually want inside an effect.
  const [wasOpen, setWasOpen] = useState(isOpen);

  const busy = isSubmitting || resending;

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen && autoSendOnOpen) {
      setError(null);
      setResending(true);
    }
  }

  useEffect(() => {
    if (!isOpen || !autoSendOnOpen) return;
    resendVerification(email)
      .then(setNotice)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Something went wrong — try again.");
      })
      .finally(() => setResending(false));
  }, [isOpen, autoSendOnOpen, email, resendVerification]);

  function close() {
    handleClose();
    window.setTimeout(() => {
      reset();
      setNotice(null);
      setError(null);
      setResending(false);
    }, 250); // after the sheet's exit animation
  }

  const onSubmit = handleSubmit(async (data) => {
    setError(null);
    try {
      await verifyEmail(email, data.code);
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — try again.");
    }
  });

  async function resend() {
    if (busy) return;
    setError(null);
    setResending(true);
    try {
      setNotice(await resendVerification(email));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={close} className="bg-surface px-6 pt-6 pb-8">
      <div className="w-10 h-1 rounded-full bg-border-strong mx-auto mb-5" />
      <h2 className="text-xl font-bold text-fg mb-1.5">Verify your email</h2>
      <p className="text-sm text-fg-faint mb-5">
        {message ?? `Enter the code we sent to ${email}`}
      </p>
      <form onSubmit={onSubmit}>
        <FormInputs inputs={Inputs} control={control} />
        {notice && <p className="text-sm text-fg-muted mt-2">{notice}</p>}
        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
        <motion.button
          type="submit"
          whileTap={tap}
          disabled={busy || watch("code").length !== 6}
          className="w-full bg-fg text-fg-inverse rounded-2xl py-3.5 font-semibold flex items-center justify-center gap-2 mt-5 disabled:opacity-60"
        >
          {busy && <LoaderCircle size={18} className="animate-spin" />}
          Verify
        </motion.button>
        <button
          type="button"
          onClick={resend}
          disabled={busy}
          className="w-full text-center text-sm font-medium text-fg-muted mt-4 disabled:opacity-60"
        >
          Resend code
        </button>
      </form>
    </BottomSheet>
  );
}
