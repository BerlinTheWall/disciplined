import type { PropsWithChildren } from "react";

import { PasswordInput } from "./PasswordInput";
import { TextInput } from "./TextInput";
import { INPUT_TYPE } from "@/constants/input-type";
import type { FormInputTypes } from "@/types/input-types";

type HandleInputTypeProps = {
  field: FormInputTypes;
  control: any;
};

const HandleInputType = ({ control, field }: HandleInputTypeProps) => {
  switch (field.inputType) {
    case INPUT_TYPE.TEXT:
      return <TextInput input={field} control={control} />;
    case INPUT_TYPE.PASSWORD:
      return <PasswordInput input={field} control={control} />;

    default:
      return <></>;
  }
};

type FormInputsProps = {
  inputs: FormInputTypes[];
  control: any;
};

const FormInputs: React.FC<PropsWithChildren<FormInputsProps>> = ({
  // children,
  inputs,
  control,
}) => {
  return inputs
    .filter((field) => !field.hide)
    .map((field, i) => <HandleInputType key={i} field={field} control={control} />);
};

export { FormInputs };
