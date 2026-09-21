import { yupResolver } from "@hookform/resolvers/yup";
import { useForm } from "react-hook-form";
import * as yup from "yup";
import { useShallow } from "zustand/shallow";

import { Button } from "@/components/Button";
import { FormInputs } from "@/components/form";
import { INPUT_TYPE } from "@/constants/input-type";
import { tap } from "@/lib/motion";
import { useAuthErrorStore, useAuthStore } from "@/store/authStore";
import { useVerifyEmailStore } from "@/store/verifyEmail";
import type { FormInputTypes } from "@/types/input-types";

const schema = yup.object({
  firstName: yup.string().label("First name").required().default(""),
  lastName: yup.string().label("Last name").required().default(""),
  email: yup.string().label("Email address").email().required().default(""),
  password: yup
    .string()
    .label("Password")
    .min(8, "Password must be at least 8 characters.")
    .required()
    .default(""),
  confirmPassword: yup
    .string()
    .label("Confirm password")
    .default("")
    .oneOf([yup.ref("password")], "Passwords must match."),
});
type FormSchemaType = yup.InferType<typeof schema>;

const SignUpForm = () => {
  const [register] = useAuthStore(useShallow((state) => [state.register]));
  const [handleShow] = useVerifyEmailStore(useShallow((state) => [state.handleShow]));
  const [setError] = useAuthErrorStore(useShallow((state) => [state.setError]));

  const {
    handleSubmit,
    control,
    formState: { isSubmitting },
  } = useForm<FormSchemaType>({
    resolver: yupResolver(schema),
    defaultValues: schema.getDefault(),
  });

  const onSubmit = handleSubmit(async (data) => {
    setError(null);
    try {
      const email = data.email.trim();
      await register(email, data.password, data.firstName.trim(), data.lastName.trim());
      handleShow(email);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
    }
  });

  const Inputs: FormInputTypes[] = [
    {
      inputType: INPUT_TYPE.TEXT,
      name: "firstName",
      label: "First name",
      placeholder: "First name",
    },
    {
      inputType: INPUT_TYPE.TEXT,
      name: "lastName",
      label: "Last name",
      placeholder: "Last name",
    },
    {
      inputType: INPUT_TYPE.TEXT,
      name: "email",
      label: "Email address",
      placeholder: "you@example.com",
      gridSize: "col-span-2",
      props: {
        type: "email",
        autoComplete: "email",
      },
    },
    {
      inputType: INPUT_TYPE.PASSWORD,
      name: "password",
      label: "Password",
      gridSize: "col-span-2",
      placeholder: "Min. 8 characters",
      props: {
        autoComplete: "new-password",
      },
    },
    {
      inputType: INPUT_TYPE.PASSWORD,
      name: "confirmPassword",
      label: "Confirm password",
      gridSize: "col-span-2",
      placeholder: "Re-enter your password",
      props: {
        autoComplete: "new-password",
      },
    },
  ];

  return (
    <form onSubmit={onSubmit} className="">
      <h2 className="text-2xl font-semibold text-fg-muted mb-6">Sign up</h2>
      <div className="grid grid-cols-2 gap-4">
        <FormInputs inputs={Inputs} control={control} />
      </div>

      <Button loading={isSubmitting} type="submit" whileTap={tap}>
        Create account
      </Button>
    </form>
  );
};

export default SignUpForm;
