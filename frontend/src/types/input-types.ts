import type { InputHTMLAttributes } from "react";

import type { INPUT_TYPE } from "@/constants/input-type";

type General = {
  name: string;
  gridSize?: string;
  helperText?: string | React.ReactNode;
  label?: string;
  hide?: boolean;
};

export type TextInputType = General & {
  placeholder?: string;
  maxLength?: number;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  props?: Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "placeholder">;
};
export type PasswordInputType = Omit<TextInputType, "endIcon">;

export type FormInputTypes =
  | (TextInputType & {
      inputType: INPUT_TYPE.TEXT;
    })
  | (PasswordInputType & {
      inputType: INPUT_TYPE.PASSWORD;
    });
