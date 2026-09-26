import { useController } from "react-hook-form";

import { errorClass, fieldClass } from "./classes";
import { cn } from "@/lib/cn";
import { validateNumberInput } from "@/lib/validate-number-input";
import type { NumberInputType } from "@/types/input-types";

type Props = {
  input: NumberInputType;
  control: any;
};

export const NumberInput = ({ input, control }: Props) => {
  const {
    field,
    fieldState: { error },
  } = useController({
    name: input.name,
    control: control,
  });

  const handleOnChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!validateNumberInput(e.target.value)) {
      return;
    }

    const val = e.target.value.replace(/,/g, "");

    if (input.maxLength) {
      if (val.length > input.maxLength) {
        return;
      }

      field.onChange(val);
    } else {
      field.onChange(val);
    }
    if (input.props?.onChange) {
      input.props?.onChange(e);
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
          {...field}
          inputMode="numeric"
          placeholder={input.placeholder}
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
