import { yupResolver } from "@hookform/resolvers/yup";
import { useForm } from "react-hook-form";
import * as yup from "yup";
import { useShallow } from "zustand/shallow";

import ForgotPasswordSheet from "./ForgotPasswordSheet";
import { Button } from "@/components/Button";
import { FormInputs } from "@/components/form";
import { INPUT_TYPE } from "@/constants/input-type";
import { useDisclosure } from "@/hooks/useDisclosure";
import { tap } from "@/lib/motion";
import { useAuthErrorStore, useAuthStore } from "@/store/authStore";
import { useVerifyEmailStore } from "@/store/verifyEmailStore";
import type { FormInputTypes } from "@/types/input-types";

const schema = yup.object({
  email: yup.string().label("Email address").email().required().default(""),
  password: yup.string().label("Password").required().default(""),
});
type FormSchemaType = yup.InferType<typeof schema>;

const LoginForm = () => {
  const { open, toggle } = useDisclosure();

  const [login] = useAuthStore(useShallow((state) => [state.login]));
  const [handleShow] = useVerifyEmailStore(useShallow((state) => [state.handleShow]));
  const [setError] = useAuthErrorStore(useShallow((state) => [state.setError]));

  const {
    handleSubmit,
    control,
    formState: { isSubmitting },
    getValues,
  } = useForm<FormSchemaType>({
    resolver: yupResolver(schema),
    defaultValues: schema.getDefault(),
  });

  const onSubmit = handleSubmit(async (data) => {
    setError(null);
    const email = data.email.trim();
    try {
      await login(email, data.password);
    } catch (err: any) {
      if (err.status === 403) {
        // Correct credentials, unverified account — see routers/auth.py.
        handleShow(email, {
          autoSend: true,
          message: "This account hasn't been verified yet.",
        });
      } else {
        setError(err.message ?? "Something went wrong. Please try again.");
      }
    }
  });

  const Inputs: FormInputTypes[] = [
    {
      inputType: INPUT_TYPE.TEXT,
      name: "email",
      label: "Email address",
      placeholder: "you@example.com",
      props: {
        type: "email",
        autoComplete: "email",
      },
    },
    {
      inputType: INPUT_TYPE.PASSWORD,
      name: "password",
      label: "Password",
      placeholder: "Your password",
      props: {
        autoComplete: "current-password",
      },
    },
  ];

  return (
    <>
      <form onSubmit={onSubmit}>
        <h2 className="text-2xl font-semibold text-fg-muted mb-6">Login</h2>
        <div className="grid grid-cols-1 gap-4">
          <FormInputs inputs={Inputs} control={control} />
        </div>
        <div className="flex justify-end mt-1.5">
          <button type="button" onClick={toggle} className="text-sm font-medium text-fg-muted">
            Forgot password?
          </button>
        </div>
        <Button className="mt-8" loading={isSubmitting} type="submit" whileTap={tap}>
          Login
        </Button>
      </form>

      <ForgotPasswordSheet isOpen={open} onClose={toggle} initialEmail={getValues("email")} />
    </>
  );
};

export default LoginForm;
