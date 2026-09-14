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
  signupAdmin,
} from "../api/auth.api.ts";

export const currentAdminQueryKey = ["current-admin"] as const;
export const adminSessionsQueryKey = ["admin-sessions"] as const;

/** Loads the current administrator and drops stale business cache after an identity switch. */
export function useCurrentAdmin() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: currentAdminQueryKey,
    queryFn: async () => {
      const previousAdminId = queryClient.getQueryData<
        Awaited<ReturnType<typeof loadCurrentAdmin>>
      >(currentAdminQueryKey)?.data.admin.id;
      const response = await loadCurrentAdmin();

      if (previousAdminId && previousAdminId !== response.data.admin.id) {
        queryClient.removeQueries({
          predicate: (query) => query.queryKey[0] !== currentAdminQueryKey[0],
        });
      }

      return response;
    },
    retry: false,
  });
}

/** Creates the login mutation and starts with a cache owned only by that account. */
export function useLoginAdmin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: loginAdmin,
    onSuccess: async (response) => {
      queryClient.clear();
      queryClient.setQueryData(currentAdminQueryKey, response);
      await navigate({ to: "/dashboard", replace: true });
    },
  });
}

/** Creates an account, clears prior-account cache data and opens its dashboard. */
export function useSignupAdmin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signupAdmin,
    onSuccess: async (response) => {
      queryClient.clear();
      queryClient.setQueryData(currentAdminQueryKey, response);
      await navigate({ to: "/dashboard", replace: true });
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
      queryClient.clear();
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
