/* eslint-disable */
import { useController } from "react-hook-form";

import { errorClass, fieldClass } from "./classes";
import { cn } from "@/lib/cn";
import type { TextInputType } from "@/types/input-types";

type Props = {
  input: TextInputType;
  control: any;
};

export const TextInput = ({ input, control }: Props) => {
  const {
    field,
    fieldState: { error },
  } = useController({
    name: input.name,
    control: control,
  });

  const handleOnChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (input.maxLength) {
      if (e.target.value.length > input.maxLength) {
        return;
      }

      field.onChange(e);
    } else {
      field.onChange(e);
    }

    if (input?.props?.onChange) {
      input.props.onChange(e);
    }
  };

  const hasStartIcon = !!input?.startIcon;
  const hasEndIcon = !!input?.endIcon;

  return (
    <div className={cn("flex flex-col", input.gridSize)}>
      {input.label && <label className="mb-1.5 text-sm font-semibold">{input.label}</label>}
      <div className="relative flex items-center">
        {hasStartIcon && (
          <span className="absolute left-3 flex items-center justify-center  text-fg-muted pointer-events-none">
            {input.startIcon}
          </span>
        )}
        <input
          {...input.props}
          name={field.name}
          placeholder={input.placeholder}
          ref={field.ref}
          value={field.value ?? ""}
          onChange={handleOnChanged}
          className={cn(
            fieldClass,
            error && errorClass,
            hasStartIcon && "pl-10",
            hasEndIcon && "pr-10",
            input?.props?.className
          )}
        />
        {hasEndIcon && (
          <span className="absolute right-3 flex items-center justify-center text-fg-muted">
            {input.endIcon}
          </span>
        )}
      </div>
      {error?.message && <span className="text-red-500 text-xs mt-1.5 ml-1">{error?.message}</span>}
      {input?.helperText && (
        <span className="text-fg-muted text-xs mt-1.5 ml-4">{input?.helperText}</span>
      )}
    </div>
  );
};
