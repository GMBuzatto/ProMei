import { USER_STATUSES, type UserStatus } from "../types";
import { userStatusLabel } from "./user-badges";

/** Opções de situação, na ordem em que aparecem nos selects desta feature. */
export const USER_STATUS_OPTIONS: { value: UserStatus; label: string }[] = USER_STATUSES.map(
  (status) => ({ value: status, label: userStatusLabel(status) }),
);
