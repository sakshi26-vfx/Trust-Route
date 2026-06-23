import {
  isConnected,
  isAllowed,
  setAllowed,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";

export const connectWallet = async (): Promise<string | null> => {
  try {
    if (!await isConnected()) {
      alert("Freighter Wallet is not installed or enabled.");
      return null;
    }

    if (!await isAllowed()) {
      await setAllowed();
    }

    const access = await requestAccess();
    if (!access || !access.address) {
      console.error("No address returned from Freighter.");
      return null;
    }

    return access.address;
  } catch (err) {
    console.error("Failed to connect Freighter wallet:", err);
    return null;
  }
};

export const getConnectedAddress = async (): Promise<string | null> => {
  try {
    if (await isConnected() && await isAllowed()) {
      const access = await requestAccess();
      return access.address || null;
    }
  } catch (e) {
    console.error(e);
  }
  return null;
};

export const signTx = async (
  xdr: string,
  network: "TESTNET" | "PUBLIC" = "TESTNET"
): Promise<string | null> => {
  try {
    const passphrase = network === "TESTNET" 
      ? "Test Stellar Network ; September 2015" 
      : "Public Global Stellar Network ; October 2015";
    const result = await signTransaction(xdr, {
      networkPassphrase: passphrase,
    });
    return result.signedTxXdr || null;
  } catch (err) {
    console.error("Signing failed:", err);
    return null;
  }
};
