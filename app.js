// Finite field operations
const PRIME = 257; // Prime field characteristic (first prime > 256)

function mod(a, m = PRIME) {
    return ((a % m) + m) % m;
}

function randInt(max) {
    return Math.floor(Math.random() * max);
}

// Polynomial operations in finite field
function evalPoly(coeffs, x) {
    return coeffs.reduce((y, a) => mod(mod(y * x) + a));
}

function interpolate(shares) {
    const secret = shares.reduce((acc, [x1, y1]) => {
        const basis = shares.reduce((prod, [x2]) => {
            if (x1 === x2) return prod;
            return mod(prod * mod(x1 - x2));
        }, 1);
        const inv = [...Array(PRIME)].findIndex((_,i) => mod(i * basis) === 1);
        return mod(acc + mod(y1 * inv));
    }, 0);
    return secret;
}

// Convert between text and numbers
function textToBytes(text) {
    return [...text].map(c => c.charCodeAt(0));
}

function bytesToText(bytes) {
    return String.fromCharCode(...bytes);
}

// Sample BIP39 words (you can replace with full list)
const SAMPLE_WORDS = ['abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse'];

// Encryption functions
function generateKey() {
    const words = [];
    const usedIndices = new Set();
    
    while (words.length < 3) {
        const index = Math.floor(Math.random() * SAMPLE_WORDS.length);
        if (!usedIndices.has(index)) {
            usedIndices.add(index);
            words.push(SAMPLE_WORDS[index]);
        }
    }
    
    return words;
}

function encryptShare(share, key) {
    const combinedKey = key.join(' ');
    const encoder = new TextEncoder();
    const data = encoder.encode(share);
    const keyData = encoder.encode(combinedKey);
    
    // Simple XOR encryption
    const encrypted = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
        encrypted[i] = data[i] ^ keyData[i % keyData.length];
    }
    
    // Convert to base64 instead of hex for more compact representation
    return btoa(String.fromCharCode.apply(null, encrypted));
}

function decryptShare(encryptedShare, key) {
    const combinedKey = key.join(' ');
    const encoder = new TextEncoder();
    const keyData = encoder.encode(combinedKey);
    
    // Convert base64 back to bytes
    const encrypted = new Uint8Array(
        atob(encryptedShare)
            .split('')
            .map(c => c.charCodeAt(0))
    );
    
    // XOR decrypt
    const decrypted = new Uint8Array(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) {
        decrypted[i] = encrypted[i] ^ keyData[i % keyData.length];
    }
    
    return new TextDecoder().decode(decrypted);
}

// Main secret sharing functions
function createShares(secret, n, k) {
    const bytes = textToBytes(secret);
    const shares = bytes.map(byte => {
        const coeffs = [byte, ...Array(k-1).fill().map(() => randInt(PRIME))];
        return [...Array(n)].map((_, i) => [i + 1, evalPoly(coeffs, i + 1)]);
    });
    
    // Transpose to get shares by index instead of by byte
    return [...Array(n)].map((_, i) => 
        shares.map(byteShares => byteShares[i])
    ).map(share => JSON.stringify(share));
}

function recoverSecret(shares) {
    try {
        const parsedShares = shares.map(s => JSON.parse(s));
        const bytes = parsedShares[0].map((_, byteIndex) => {
            const byteShares = parsedShares.map(share => share[byteIndex]);
            return interpolate(byteShares);
        });
        return bytesToText(bytes);
    } catch (e) {
        throw new Error('Invalid shares format');
    }
}

// UI functions
function showSection(sectionId) {
    // Hide all sections
    document.getElementById('createSection').classList.add('hidden');
    document.getElementById('recoverSection').classList.add('hidden');
    document.getElementById('modeSelection').classList.add('hidden');
    
    // Show requested section
    document.getElementById(sectionId).classList.remove('hidden');
    
    // Focus on recovery words when recover section is shown
    if (sectionId === 'recoverSection') {
        document.getElementById('recoveryWords').focus();
    }
    
    // Remove any existing back buttons first
    const existingBackBtns = document.querySelectorAll('.back-btn');
    existingBackBtns.forEach(btn => btn.remove());
    
    // Add back button if not in mode selection
    if (sectionId !== 'modeSelection') {
        const section = document.getElementById(sectionId);
        const backBtn = document.createElement('button');
        backBtn.className = 'button-card back-btn';
        backBtn.style.background = '#666';
        backBtn.innerHTML = '← Back';
        backBtn.onclick = () => {
            showSection('modeSelection');
            // Clear any scanned data when going back
            uploadedShares.clear();
            if (qrScanner) {
                qrScanner.stop();
            }
            // Reset UI elements
            document.getElementById('camera-status').textContent = '';
            document.getElementById('recoveryWords').value = '';
            document.getElementById('recoveredSecret').value = '';
            document.getElementById('preview-area').innerHTML = '';
            document.getElementById('shares-preview').innerHTML = '';
        };
        section.querySelector('.card').insertBefore(backBtn, section.querySelector('.card').firstChild);
    }
}

// Camera scanning functionality
let qrScanner = null;
const uploadedShares = new Set();

function startCamera() {
    const cameraContainer = document.getElementById('camera-container');
    const fileUploadArea = document.getElementById('fileUploadArea');
    const cameraStatus = document.getElementById('camera-status');
    const recoveryWords = document.getElementById('recoveryWords');
    
    // Ensure recovery words are entered first
    if (!recoveryWords.value.trim()) {
        alert('Please enter the recovery words first');
        recoveryWords.focus();
        return;
    }
    
    const words = recoveryWords.value.trim().split(/\s+/);
    if (words.length !== 3) {
        alert('Please enter exactly 3 recovery words');
        recoveryWords.focus();
        return;
    }
    
    cameraContainer.style.display = 'block';
    fileUploadArea.style.display = 'none';
    
    if (!qrScanner) {
        qrScanner = new QrScanner(
            cameraContainer.querySelector('video'),
            result => {
                if (result) {
                    const scannedData = result.data;
                    if (!uploadedShares.has(scannedData)) {
                        uploadedShares.add(scannedData);
                        cameraStatus.textContent = `✅ Scanned ${uploadedShares.size} share${uploadedShares.size > 1 ? 's' : ''}`;
                        
                        // Vibrate if supported
                        if (navigator.vibrate) {
                            navigator.vibrate(100);
                        }
                        
                        // Play success sound
                        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZRA0PVqzn77BdGAg+ltryxnMpBSl+zPLaizsIGGS57OihUBELTKXh8bllHgU2jdXzzn0vBSF1xe/glEILElyx6OyrWBUIQ5zd8sFuJAUuhM/z1YU2Bhxqvu7mnEYODlOq5O+zYBoGPJPY88p2KwUme8rx3I4+CRZiturqpVITCkmi4PK8aB8GM4nU8tGAMQYeb8Lv45ZFDBFYr+fwtFoXCA==');
                        audio.play().catch(() => {}); // Ignore errors if audio can't play
                        
                        // If we have enough shares, enable recover button
                        document.getElementById('recoverBtn').disabled = uploadedShares.size < 2;
                        
                        // Auto-recover if we have enough shares
                        if (uploadedShares.size >= 2) {
                            document.getElementById('recoverBtn').click();
                        }
                    }
                }
            },
            {
                highlightScanRegion: true,
                highlightCodeOutline: true,
            }
        );
    }
    
    qrScanner.start().catch(error => {
        cameraStatus.textContent = '❌ Error accessing camera. Please try file upload instead.';
        console.error('Camera error:', error);
    });
}

function showFileUpload() {
    if (qrScanner) {
        qrScanner.stop();
    }
    document.getElementById('camera-container').style.display = 'none';
    document.getElementById('fileUploadArea').style.display = 'block';
}

// Handle file uploads and QR code reading
document.getElementById('qrFileInput').addEventListener('change', async (e) => {
    const previewArea = document.getElementById('preview-area');
    const sharesPreview = document.getElementById('shares-preview');
    previewArea.innerHTML = '';
    uploadedShares.clear();
    
    for (const file of e.target.files) {
        const container = document.createElement('div');
        container.className = 'share-container';
        
        // Create preview
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.style.maxWidth = '200px';
        img.style.maxHeight = '200px';
        container.appendChild(img);
        
        previewArea.appendChild(container);
        
        // Process QR code
        const encryptedShare = await processImage(file);
        if (encryptedShare) {
            uploadedShares.add(encryptedShare);
            
            const shareInfo = document.createElement('div');
            shareInfo.textContent = 'Share detected ';
            shareInfo.style.color = 'green';
            container.appendChild(shareInfo);
        } else {
            const shareInfo = document.createElement('div');
            shareInfo.textContent = 'No QR code detected ';
            shareInfo.style.color = 'red';
            container.appendChild(shareInfo);
        }
    }
    
    sharesPreview.textContent = `Detected ${uploadedShares.size} valid shares`;
});

document.getElementById('recoverBtn').addEventListener('click', () => {
    try {
        const recoveryWordsInput = document.getElementById('recoveryWords').value.trim();
        if (!recoveryWordsInput) {
            alert('Please enter the recovery words');
            return;
        }
        
        const recoveryWords = recoveryWordsInput.split(/\s+/);
        if (recoveryWords.length !== 3) {
            alert('Please enter exactly 3 recovery words');
            return;
        }
        
        const shares = Array.from(uploadedShares);
        if (shares.length < 2) {
            alert('Please scan at least 2 share QR codes');
            return;
        }
        
        // Stop camera if it's running
        if (qrScanner) {
            qrScanner.stop();
        }
        
        // Decrypt shares
        const decryptedShares = shares.map(share => decryptShare(share, recoveryWords));
        
        const secret = recoverSecret(decryptedShares);
        document.getElementById('recoveredSecret').value = secret;
    } catch (e) {
        alert('Error recovering secret: ' + e.message);
    }
});

// QR code reading functionality
const processImage = async (file) => {
    try {
        const result = await QrScanner.scanImage(file, { 
            returnDetailedScanResult: true 
        });
        return result.data;
    } catch (e) {
        console.error('QR scan error:', e);
        return null;
    }
};

// Initialize the UI
document.addEventListener('DOMContentLoaded', () => {
    showSection('modeSelection');
    
    // Initialize shares selector
    const sharesSlider = document.getElementById('sharesSlider');
    const numShares = document.getElementById('numShares');
    const requiredShares = document.getElementById('requiredShares');
    
    function updateRequiredShares(total) {
        // Calculate required shares based on total
        // Formula: ceil(total/2) for reasonable security
        const required = Math.ceil(total / 2);
        requiredShares.textContent = required;
    }
    
    // Sync slider and number input
    sharesSlider.addEventListener('input', (e) => {
        numShares.value = e.target.value;
        updateRequiredShares(parseInt(e.target.value));
    });
    
    numShares.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        if (value >= 3 && value <= 10) {
            sharesSlider.value = value;
            updateRequiredShares(value);
        }
    });
    
    // Set initial values
    numShares.value = '3';
    sharesSlider.value = '3';
    updateRequiredShares(3);
    
    // Initialize seed phrase input
    const seedPhraseInput = document.getElementById('seedPhraseInput');
    const secretInput = document.getElementById('secretInput');
    
    // Create 24 word input boxes
    for (let i = 0; i < 24; i++) {
        const wordContainer = document.createElement('div');
        wordContainer.className = 'seed-word';
        
        const numberSpan = document.createElement('span');
        numberSpan.className = 'seed-word-number';
        numberSpan.textContent = (i + 1).toString();
        
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = '';
        input.setAttribute('data-index', i);
        
        // Auto-advance to next input on space or enter
        input.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                const nextInput = document.querySelector(`input[data-index="${i + 1}"]`);
                if (nextInput) nextInput.focus();
            }
        });
        
        // Handle word input
        input.addEventListener('input', (e) => {
            const words = Array.from(document.querySelectorAll('.seed-word input'))
                .map(input => input.value.trim())
                .filter(word => word.length > 0);
            
            // Update hidden input
            secretInput.value = words.join(' ');
            
            // Update visual state
            wordContainer.classList.toggle('filled', e.target.value.trim().length > 0);
            
            // Auto-advance to next input if space is typed
            if (e.target.value.includes(' ')) {
                e.target.value = e.target.value.replace(' ', '');
                const nextInput = document.querySelector(`input[data-index="${i + 1}"]`);
                if (nextInput) nextInput.focus();
            }
        });
        
        wordContainer.appendChild(numberSpan);
        wordContainer.appendChild(input);
        seedPhraseInput.appendChild(wordContainer);
    }
});

// UI handlers
document.getElementById('splitBtn').addEventListener('click', async () => {
    const title = document.getElementById('secretTitle');
    const secret = document.getElementById('secretInput');
    const numShares = document.getElementById('numShares');
    const splitBtn = document.getElementById('splitBtn');
    const n = parseInt(numShares.value);
    const k = 2; // Fixed threshold of 2
    
    if (!title.value || !secret.value || isNaN(n) || n < 3 || n > 255) {
        alert('Please fill in all fields correctly');
        return;
    }
    
    // Disable inputs and button
    title.disabled = true;
    document.querySelectorAll('.seed-word input').forEach(input => input.disabled = true);
    numShares.disabled = true;
    splitBtn.disabled = true;
    
    const encryptionWords = generateKey();
    const keyDisplay = document.getElementById('encryptionKey');
    keyDisplay.innerHTML = `
        <div style="margin: 20px 0; padding: 15px; background: #f8f8f8; border-radius: 8px; border-left: 4px solid #4CAF50;">
            <h3 style="margin-top: 0;">🔐 Recovery Words</h3>
            <p style="font-size: 1.2em; font-weight: bold; color: #333;">${encryptionWords.join(' ')}</p>
            <p style="color: #666; margin-bottom: 0;">
                ⚠️ Save these words! You'll need them to recover your secret.
            </p>
        </div>
    `;
    
    const shares = createShares(secret.value, n, k);
    const encryptedShares = shares.map(share => encryptShare(share, encryptionWords));
    
    const sharesList = document.getElementById('sharesList');
    sharesList.innerHTML = '';
    
    const header = document.createElement('h3');
    header.style.width = '100%';
    header.style.marginBottom = '20px';
    header.textContent = `🥔 Generated ${n} encrypted shares:`;
    sharesList.appendChild(header);
    
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.justifyContent = 'center';
    container.style.gap = '20px';
    sharesList.appendChild(container);
    
    for (let i = 0; i < encryptedShares.length; i++) {
        const shareContainer = document.createElement('div');
        shareContainer.className = 'share-container card';
        shareContainer.style.flex = '0 1 300px';
        shareContainer.style.textAlign = 'center';
        shareContainer.style.padding = '20px';
        
        const title = document.createElement('h3');
        title.textContent = `Share ${i + 1}`;
        title.style.margin = '0 0 15px 0';
        shareContainer.appendChild(title);
        
        const qrDiv = document.createElement('div');
        qrDiv.className = 'qr-code';
        shareContainer.appendChild(qrDiv);
        
        container.appendChild(shareContainer);
        
        try {
            // Clear any existing QR code first
            qrDiv.innerHTML = '';
            
            // Check if QRCode is available
            if (typeof QRCode === 'undefined') {
                throw new Error('QR Code library not loaded');
            }
            
            // Create a temporary div for QR code
            const tempQrDiv = document.createElement('div');
            
            // Generate QR code in the temporary div
            new QRCode(tempQrDiv, {
                text: encryptedShares[i],
                width: 200,
                height: 200,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M,
                margin: 2
            });
            
            // Move the QR code image to the actual div
            const qrImage = tempQrDiv.querySelector('img');
            if (qrImage) {
                // Set proper styling
                qrImage.style.display = 'block';
                qrImage.style.margin = '0 auto';
                qrDiv.appendChild(qrImage);
            } else {
                throw new Error('QR Code image not generated');
            }
            
        } catch (error) {
            console.error('Error generating QR code:', error);
            qrDiv.innerHTML = '<p style="color: red;">Error generating QR code: ' + error.message + '</p>';
        }
    }
});
