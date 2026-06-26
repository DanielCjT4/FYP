"use client";
import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ethers } from 'ethers';
import VulnerabilityPlatform from '../../artifacts/contracts/VulnerabilityPlatform.sol/VulnerabilityPlatform.json';

const AuthContext = createContext();

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ROLE_NAMES = ['None', 'Researcher', 'Organization', 'Validator'];
// Read target network from .env (fallback to Hardhat 1337 if not set)
const TARGET_CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || '0x539';

// Helper: force MetaMask onto the correct network
async function ensureCorrectNetwork() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: TARGET_CHAIN_ID }],
        });
    } catch (switchError) {
        // If the network is not added to MetaMask (code 4902)
        if (switchError.code === 4902) {
            const isSepolia = TARGET_CHAIN_ID === '0xaa36a7';
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: TARGET_CHAIN_ID,
                    chainName: isSepolia ? 'Sepolia Testnet' : 'DecenBug Localhost (1337)',
                    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                    rpcUrls: isSepolia ? ['https://rpc.sepolia.org'] : ['http://127.0.0.1:8545'],
                    blockExplorerUrls: isSepolia ? ['https://sepolia.etherscan.io'] : null
                }],
            });
        } else {
            console.error("Failed to switch network:", switchError);
        }
    }
    const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (currentChainId !== TARGET_CHAIN_ID) {
        throw new Error(`You must allow MetaMask to switch to the correct network (${TARGET_CHAIN_ID}).`);
    }
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null); // { username, role, wallet }
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    // On mount, check if a session is cached
    useEffect(() => {
        const restoreSession = async () => {
            const stored = localStorage.getItem('decenbug_user');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    setUser(parsed);
                } catch {
                    localStorage.removeItem('decenbug_user');
                }
            }
            setLoading(false);
        };
        restoreSession();
    }, []);

    // Web3 Login: Connect wallet, read on-chain identity, redirect
    const login = async () => {
        try {
            if (!window.ethereum) {
                return { success: false, error: "MetaMask not detected. Please install MetaMask." };
            }

            // Force MetaMask account picker
            await window.ethereum.request({
                method: 'wallet_requestPermissions',
                params: [{ eth_accounts: {} }]
            });

            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const wallet = accounts[0];

            // Force correct network before querying chain
            await ensureCorrectNetwork();

            const provider = new ethers.BrowserProvider(window.ethereum);
            const contract = new ethers.Contract(CONTRACT_ADDRESS, VulnerabilityPlatform.abi, provider);
            const profile = await contract.users(wallet);

            const roleNum = Number(profile[0]);
            const name = profile[1];
            const profileCid = profile[2];
            const isRegistered = profile[3];

            if (!isRegistered) {
                return { success: false, error: "This wallet is not registered. Please register first." };
            }

            const role = ROLE_NAMES[roleNum];

            // Sync with off-chain IPFS profile metadata to load the custom profile name if available
            let displayName = name;
            const localCid = localStorage.getItem(`decenbug_profile_cid_${wallet.toLowerCase()}`);
            const cidToLoad = localCid || profileCid;

            if (cidToLoad) {
                try {
                    const res = await fetch(`/api/ipfs/read?cid=${cidToLoad}`);
                    if (res.ok) {
                        const parsedProfile = await res.json();
                        if (parsedProfile.name) {
                            displayName = parsedProfile.name;
                        }
                    }
                } catch (e) {
                    console.warn("Failed to retrieve custom profile name on login, using on-chain registry fallback:", e);
                }
            }

            const userData = { username: displayName, role, wallet };
            setUser(userData);
            localStorage.setItem('decenbug_user', JSON.stringify(userData));

            const roleMap = {
                "Researcher": "/dashboard/researcher",
                "Organization": "/dashboard/org",
                "Validator": "/dashboard/validator"
            };
            router.push(roleMap[role] || "/");
            return { success: true };

        } catch (err) {
            console.error("Web3 Login Failed:", err);
            return { success: false, error: err.message || "Wallet connection failed" };
        }
    };


    // Web3 Register: Upload profile to IPFS, commit identity to blockchain
    const register = async (name, role, profileData) => {
        try {
            if (!window.ethereum) {
                return { success: false, error: "MetaMask not detected. Please install MetaMask." };
            }

            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const wallet = accounts[0];

            // Force correct network before any chain interaction
            await ensureCorrectNetwork();

            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, VulnerabilityPlatform.abi, signer);

            // Check if already registered
            const existing = await contract.users(wallet);
            if (existing[3]) {
                return { success: false, error: "This wallet is already registered on the blockchain." };
            }

            // 1. Upload detailed profile JSON to IPFS
            const profileJson = JSON.stringify({
                name,
                role,
                wallet,
                ...profileData,
                registeredAt: new Date().toISOString()
            });

            const blob = new Blob([profileJson], { type: 'application/json' });
            const formData = new FormData();
            formData.append("file", blob, `profile_${role.toLowerCase()}.json`);

            const ipfsRes = await fetch("/api/ipfs", { method: "POST", body: formData });
            const ipfsData = await ipfsRes.json();
            const profileCid = ipfsData.IpfsHash;

            if (!profileCid) {
                return { success: false, error: "IPFS upload failed. Please try again." };
            }

            // 2. Commit identity to blockchain (Gas Fee)
            const ROLE_MAP = { 'Researcher': 1, 'Organization': 2, 'Validator': 3 };
            const tx = await contract.registerUser(ROLE_MAP[role], name, profileCid);
            await tx.wait();

            // 3. Cache session & redirect to dashboard
            const userData = { username: name, role, wallet };
            setUser(userData);
            localStorage.setItem('decenbug_user', JSON.stringify(userData));

            const roleMap = {
                "Researcher": "/dashboard/researcher",
                "Organization": "/dashboard/org",
                "Validator": "/dashboard/validator"
            };
            router.push(roleMap[role] || "/");

            return { success: true, txHash: tx.hash, profileCid };

        } catch (err) {
            console.error("Web3 Registration Failed:", err);
            if (err.reason) return { success: false, error: err.reason };
            if (err.message?.includes("user rejected")) return { success: false, error: "Transaction cancelled by user." };
            return { success: false, error: err.message || "Registration failed" };
        }
    };

    const updateUser = (newUserData) => {
        setUser(prev => {
            const updated = prev ? { ...prev, ...newUserData } : { ...newUserData };
            localStorage.setItem('decenbug_user', JSON.stringify(updated));
            return updated;
        });
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('decenbug_user');
        router.push('/');
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, loading, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
