"use client";
import { createContext, useContext, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ethers } from 'ethers';
import VulnerabilityPlatform from '../../artifacts/contracts/VulnerabilityPlatform.sol/VulnerabilityPlatform.json';

const WalletContext = createContext();

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Localhost Deployed

export function WalletProvider({ children }) {
    const [account, setAccount] = useState(null);
    const [contract, setContract] = useState(null);
    const [provider, setProvider] = useState(null);
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState(0);
    const pathname = usePathname();

    const initializeContract = async (currentAccount) => {
        try {
            const prov = new ethers.BrowserProvider(window.ethereum);
            const signer = await prov.getSigner();
            const contractInstance = new ethers.Contract(CONTRACT_ADDRESS, VulnerabilityPlatform.abi, signer);

            setProvider(prov);
            setContract(contractInstance);

            // Fetch user role safely
            try {
                const code = await prov.getCode(CONTRACT_ADDRESS);
                if (code !== "0x") {
                    const user = await contractInstance.users(currentAccount);
                    setUserRole(Number(user[0]));
                } else {
                    console.warn("Contract not found at address:", CONTRACT_ADDRESS);
                }
            } catch (err) {
                console.error("Error fetching user role:", err);
            }

            setLoading(false);
        } catch (error) {
            console.error("Contract init failed:", error);
            setLoading(false);
        }
    };

    // Auto-connect check whenever the pathname changes (client-side navigation/redirect after login)
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const autoConnect = async () => {
            const stored = localStorage.getItem('decenbug_user');
            if (stored && window.ethereum && !account) {
                try {
                    // eth_accounts is passive — does NOT pop up MetaMask
                    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                    if (accounts.length > 0) {
                        setAccount(accounts[0]);
                        await initializeContract(accounts[0]);
                        return;
                    }
                } catch (err) {
                    console.warn("Auto-connect failed:", err);
                }
            }
            setLoading(false);
        };
        autoConnect();
    }, [pathname, account]);

    // Set up the accountsChanged event listener exactly once
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleAccountsChanged = (accounts) => {
            if (accounts.length > 0) {
                setAccount(accounts[0]);
                window.location.reload();
            } else {
                setAccount(null);
                setContract(null);
                setProvider(null);
                setUserRole(0);
            }
        };

        if (window.ethereum) {
            window.ethereum.on('accountsChanged', handleAccountsChanged);
        }

        return () => {
            if (window.ethereum) {
                window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
            }
        };
    }, []);

    const connectWallet = async (expectedRole) => {
        try {
            if (!window.ethereum) return alert("Please install MetaMask");

            // Force MetaMask to ask the user which account to connect
            await window.ethereum.request({
                method: 'wallet_requestPermissions',
                params: [{ eth_accounts: {} }]
            });

            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const selectedAccount = accounts[0];

            // If an expectedRole was provided, verify on-chain before accepting
            if (expectedRole) {
                const tempProvider = new ethers.BrowserProvider(window.ethereum);
                const tempContract = new ethers.Contract(CONTRACT_ADDRESS, VulnerabilityPlatform.abi, tempProvider);

                try {
                    const onChainUser = await tempContract.users(selectedAccount);
                    const onChainRole = Number(onChainUser[0]);
                    const ROLE_MAP = { 'Researcher': 1, 'Organization': 2, 'Validator': 3 };
                    const expectedRoleNum = ROLE_MAP[expectedRole];

                    if (onChainRole !== 0 && expectedRoleNum && onChainRole !== expectedRoleNum) {
                        const roleNames = ['None', 'Researcher', 'Organization', 'Validator'];
                        alert(`⚠️ This wallet is registered as "${roleNames[onChainRole]}" on the blockchain.\n\nYou are logged in as "${expectedRole}". Please switch to a different MetaMask account that matches your role.`);
                        return;
                    }
                } catch (err) {
                    console.warn("Could not verify on-chain role, allowing connection:", err);
                }
            }

            setAccount(selectedAccount);
            await initializeContract(selectedAccount);
        } catch (error) {
            console.error(error);
        }
    };

    const disconnectWallet = () => {
        setAccount(null);
        setContract(null);
        setProvider(null);
        setUserRole(0);
    };

    return (
        <WalletContext.Provider value={{ account, contract, connectWallet, disconnectWallet, loading, userRole }}>
            {children}
        </WalletContext.Provider>
    );
}

export function useWallet() {
    return useContext(WalletContext);
}
