"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import {
  deleteSavedAddress,
  setDefaultSavedAddress,
  type AddressBookState,
} from "./actions";

/**
 * Per-address row actions: set as default, and delete (with a confirm —
 * deleting never affects orders already placed, which hold their own
 * address snapshot). Each form reports its own error inline.
 */
export function AddressRowActions({
  addressId,
  isDefault,
}: {
  addressId: string;
  isDefault: boolean;
}) {
  const t = useTranslations("addressBook");
  const [defaultState, defaultAction, defaultPending] = useActionState<
    AddressBookState,
    FormData
  >(setDefaultSavedAddress, null);
  const [deleteState, deleteAction, deletePending] = useActionState<
    AddressBookState,
    FormData
  >(deleteSavedAddress, null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isDefault ? (
        <form action={defaultAction}>
          <input type="hidden" name="address_id" value={addressId} />
          <button
            type="submit"
            disabled={defaultPending}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {defaultPending ? t("saving") : t("setDefault")}
          </button>
        </form>
      ) : (
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
          {t("defaultBadge")}
        </span>
      )}
      <form
        action={deleteAction}
        onSubmit={(event) => {
          if (!window.confirm(t("deleteConfirm"))) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="address_id" value={addressId} />
        <button
          type="submit"
          disabled={deletePending}
          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {deletePending ? t("deleting") : t("delete")}
        </button>
      </form>
      {defaultState && "error" in defaultState ? (
        <p role="alert" className="w-full text-sm text-red-700">
          {defaultState.error}
        </p>
      ) : null}
      {deleteState && "error" in deleteState ? (
        <p role="alert" className="w-full text-sm text-red-700">
          {deleteState.error}
        </p>
      ) : null}
      {defaultState && "success" in defaultState ? (
        <p role="status" className="w-full text-sm text-emerald-700">
          {defaultState.success}
        </p>
      ) : null}
      {deleteState && "success" in deleteState ? (
        <p role="status" className="w-full text-sm text-emerald-700">
          {deleteState.success}
        </p>
      ) : null}
    </div>
  );
}
