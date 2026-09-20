import { useState } from "react";

export const useDisclosure = (initialValue: boolean = false) => {
  const [open, setOpen] = useState(initialValue);

  const toggle = () => setOpen((prev) => !prev);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  return {
    open,
    toggle,
    handleClose,
    handleOpen,
  };
};
