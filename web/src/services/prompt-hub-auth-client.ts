import { usePromptHubStore } from "@/stores/use-prompt-hub-store";

export async function promptHubAuthHeaders() {
    const store = usePromptHubStore.getState();
    const session = await store.getSession();
    if (!session?.access_token) throw new Error("请先登录卡藏账号");
    return { Authorization: `Bearer ${session.access_token}` };
}
