import { auth, currentUser } from "@clerk/nextjs/server";

export async function getAuthToken(): Promise<string> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) {
    throw new Error("No autenticado");
  }
  return token;
}

export async function getTenantId(): Promise<string> {
  const { orgId } = await auth();
  if (!orgId) {
    throw new Error("Sin organización activa");
  }
  return orgId;
}

export async function getUserRole(): Promise<string> {
  const { orgRole } = await auth();
  return orgRole?.replace(/^org:/, "") ?? "viewer";
}

export async function getCurrentUserProfile(): Promise<{
  name: string;
  email: string;
}> {
  const user = await currentUser();
  return {
    name: user?.fullName ?? user?.firstName ?? "Usuario",
    email: user?.primaryEmailAddress?.emailAddress ?? ""
  };
}
