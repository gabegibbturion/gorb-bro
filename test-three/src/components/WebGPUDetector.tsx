import { useEffect, useState } from 'react';

interface WebGPUSupportInfo {
    supported: boolean;
    reason?: string;
    browser: string;
    version: string;
    experimental: boolean;
}

export default function WebGPUDetector() {
    const [supportInfo, setSupportInfo] = useState<WebGPUSupportInfo | null>(null);
    const [showDetails, setShowDetails] = useState(false);

    useEffect(() => {
        checkWebGPUSupport();
    }, []);

    const checkWebGPUSupport = async () => {
        const info: WebGPUSupportInfo = {
            supported: false,
            browser: navigator.userAgent,
            version: '',
            experimental: false
        };

        // Check if WebGPU is available
        if (!navigator.gpu) {
            info.reason = 'WebGPU not supported in this browser';
            setSupportInfo(info);
            return;
        }

        try {
            // Try to get adapter
            const adapter = await navigator.gpu.requestAdapter({
                powerPreference: 'high-performance'
            });

            if (!adapter) {
                info.reason = 'No WebGPU adapter found (try enabling experimental features)';
                info.experimental = true;
            } else {
                info.supported = true;
                info.version = adapter.info?.description || 'Unknown';
            }
        } catch (error) {
            info.reason = `WebGPU error: ${error}`;
            info.experimental = true;
        }

        setSupportInfo(info);
    };

    const getBrowserInstructions = () => {
        const userAgent = navigator.userAgent.toLowerCase();

        if (userAgent.includes('chrome')) {
            return {
                browser: 'Chrome',
                instructions: [
                    '1. Open Chrome and go to chrome://flags/',
                    '2. Search for "Unsafe WebGPU"',
                    '3. Enable the flag',
                    '4. Restart Chrome',
                    '5. Try the WebGPU toggle again'
                ]
            };
        } else if (userAgent.includes('firefox')) {
            return {
                browser: 'Firefox',
                instructions: [
                    '1. Open Firefox and go to about:config',
                    '2. Search for "dom.webgpu.enabled"',
                    '3. Set it to true',
                    '4. Restart Firefox',
                    '5. Try the WebGPU toggle again'
                ]
            };
        } else if (userAgent.includes('safari')) {
            return {
                browser: 'Safari',
                instructions: [
                    '1. Open Safari and go to Develop menu',
                    '2. Enable "Experimental Features"',
                    '3. Look for WebGPU option',
                    '4. Enable it if available',
                    '5. Try the WebGPU toggle again'
                ]
            };
        } else {
            return {
                browser: 'Unknown',
                instructions: [
                    'WebGPU support varies by browser',
                    'Try Chrome with experimental flags enabled',
                    'Or use the fallback rendering systems'
                ]
            };
        }
    };

    if (!supportInfo) {
        return <div>Checking WebGPU support...</div>;
    }

    const browserInfo = getBrowserInstructions();

    return (
        <div style={{
            padding: '10px',
            margin: '10px',
            border: '1px solid #ccc',
            borderRadius: '5px',
            backgroundColor: supportInfo.supported ? '#e8f5e8' : '#fff3cd'
        }}>
            <h4>WebGPU Support Status</h4>
            <div style={{ marginBottom: '10px' }}>
                <strong>Status:</strong> {supportInfo.supported ? '✅ Supported' : '❌ Not Available'}
            </div>

            {supportInfo.reason && (
                <div style={{ marginBottom: '10px', color: '#d32f2f' }}>
                    <strong>Reason:</strong> {supportInfo.reason}
                </div>
            )}

            {supportInfo.experimental && (
                <div style={{ marginBottom: '10px' }}>
                    <button
                        onClick={() => setShowDetails(!showDetails)}
                        style={{
                            padding: '5px 10px',
                            backgroundColor: '#2196F3',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                        }}
                    >
                        {showDetails ? 'Hide' : 'Show'} Setup Instructions
                    </button>
                </div>
            )}

            {showDetails && supportInfo.experimental && (
                <div style={{
                    padding: '10px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '3px',
                    marginTop: '10px'
                }}>
                    <h5>Setup Instructions for {browserInfo.browser}:</h5>
                    <ol>
                        {browserInfo.instructions.map((instruction, index) => (
                            <li key={index} style={{ marginBottom: '5px' }}>
                                {instruction}
                            </li>
                        ))}
                    </ol>
                    <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                        <strong>Note:</strong> WebGPU is still experimental. If it doesn't work,
                        the system will automatically fall back to the instanced mesh renderer.
                    </div>
                </div>
            )}

            <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                <strong>Current System:</strong> The application will use the best available rendering system.
                {supportInfo.supported ? ' WebGPU is ready!' : ' Using fallback rendering.'}
            </div>
        </div>
    );
}
