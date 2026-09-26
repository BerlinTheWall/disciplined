import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface State {
  show: boolean;
  email: string;
  message?: string;
  autoSendOnOpen?: boolean;
}

const initialState: State = {
  show: false,
  email: "",
};

interface Actions {
  handleShow: (
    email: string,
    opt?: {
      message?: string;
      autoSend?: boolean;
    }
  ) => void;
  handleClose: () => void;
}

export const useVerifyEmailStore = create<State & Actions>()(
  immer((set) => ({
    ...initialState,
    handleShow: (
      email: string,
      opt?: {
        message?: string;
        autoSend?: boolean;
      }
    ) =>
      set((state) => {
        state.email = email;
        state.message = opt?.message;
        state.autoSendOnOpen = opt?.autoSend;
        state.show = true;
      }),
    handleClose: () =>
      set((state) => {
        state.show = false;
      }),
  }))
);
