import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ImpersonationStartForm } from "./impersonation-start-form";

const copy = {
  reasonLabel: "Motivo (obligatorio)",
  reasonHelp: "Describe el caso de soporte.",
  submit: "Comenzar impersonación",
};

describe("impersonation start form", () => {
  it("keeps submit disabled until the trimmed reason has ten characters", () => {
    render(<ImpersonationStartForm action={() => undefined} copy={copy} />);
    const submit = screen.getByRole("button", { name: copy.submit });
    const reason = screen.getByLabelText(copy.reasonLabel);

    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(reason, { target: { value: " debug " } });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(reason, { target: { value: "Revisar cierre mensual" } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    expect(reason.getAttribute("minlength")).toBe("10");
    expect((reason as HTMLTextAreaElement).required).toBe(true);
  });
});
