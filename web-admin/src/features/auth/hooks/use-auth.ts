import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  changeAdminPassword,
  loadAdminSessions,
  loadCurrentAdmin,
  loginAdmin,
  logoutAdmin,
  logoutAllAdminSessions,
  revokeAdminSession,
} from "../api/auth.api.ts";

export const currentAdminQueryKey = ["current-admin"] as const;
export const adminSessionsQueryKey = ["admin-sessions"] as const;

/** Loads the currently authenticated administrator. */
export function useCurrentAdmin() {
  return useQuery({
    queryKey: currentAdminQueryKey,
    queryFn: loadCurrentAdmin,
    retry: false,
  });
}

/** Creates the login mutation and opens the product page after success. */
export function useLoginAdmin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: loginAdmin,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: currentAdminQueryKey });
      await navigate({ to: "/products", replace: true });
    },
  });
}

/** Creates the logout mutation and returns the administrator to login. */
export function useLogoutAdmin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logoutAdmin,
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: currentAdminQueryKey });
      await navigate({ to: "/login", replace: true });
    },
  });
}

/** Creates the password-change mutation and requires a fresh login afterward. */
export function useChangeAdminPassword() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: changeAdminPassword,
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: "/login", replace: true });
    },
  });
}


/** Loads active sessions for the authenticated administrator. */
export function useAdminSessions() {
  return useQuery({
    queryKey: adminSessionsQueryKey,
    queryFn: loadAdminSessions,
    retry: false,
  });
}

/** Revokes one selected active session and refreshes the session list. */
export function useRevokeAdminSession() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: revokeAdminSession,
    onSuccess: async (response) => {
      if (response.data.currentSessionRevoked) {
        queryClient.clear();
        await navigate({ to: "/login", replace: true });
        return;
      }

      await queryClient.invalidateQueries({ queryKey: adminSessionsQueryKey });
    },
  });
}

/** Revokes every active session and returns the administrator to login. */
export function useLogoutAllAdminSessions() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logoutAllAdminSessions,
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: "/login", replace: true });
    },
  });
}
