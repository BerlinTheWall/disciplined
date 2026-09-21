/* eslint-disable */
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useController } from "react-hook-form";

import { errorClass, fieldClass } from "./classes";
import { cn } from "@/lib/cn";
import type { PasswordInputType } from "@/types/input-types";

type Props = {
  input: PasswordInputType;
  control: any;
};

export const PasswordInput = ({ input, control }: Props) => {
  const [showPassword, setShowPassword] = useState(false);
  const {
    field,
    fieldState: { error },
  } = useController({
    name: input.name,
    control: control,
  });

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  const hasStartIcon = !!input?.startIcon;

  return (
    <div className={cn("flex flex-col", input.gridSize)}>
      {input.label && <label className="mb-1.5 text-sm font-semibold">{input.label}</label>}
      <div className="relative flex items-center">
        {hasStartIcon && (
          <span className="absolute left-3 flex items-center justify-center text-fg-muted pointer-events-none">
            {input.startIcon}
          </span>
        )}
        <input
          {...input.props}
          type={showPassword ? "text" : "password"}
          name={field.name}
          placeholder={input.placeholder}
          ref={field.ref}
          value={field.value ?? ""}
          onChange={(e) => {
            field.onChange(e);
            if (input.props?.onChange) {
              input.props?.onChange(e);
            }
          }}
          className={cn(
            fieldClass,
            "pr-10",
            error && errorClass,
            hasStartIcon && "pl-10",
            input?.props?.className
          )}
        />
        <span
          onClick={togglePasswordVisibility}
          className="absolute right-3 flex items-center justify-center text-fg-muted"
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </span>
      </div>
      {error?.message && <span className="text-red-500 text-xs mt-1.5 ml-1">{error?.message}</span>}
      {input?.helperText && (
        <span className="text-fg-muted text-xs mt-1.5 ml-4">{input?.helperText}</span>
      )}
    </div>
  );
};
