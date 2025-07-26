// Admin panel JavaScript

let adminKey = '';
let isAuthenticated = false;

// Initialize admin panel
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    checkAuthFromUrl();
});

// Setup event listeners
function setupEventListeners() {
    // Admin key input
    document.getElementById('adminKey').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            authenticate();
        }
    });
    
    // File input and drag-drop
    const fileInput = document.getElementById('fileInput');
    const uploadZone = document.getElementById('uploadZone');
    
    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', handleDragOver);
    uploadZone.addEventListener('dragleave', handleDragLeave);
    uploadZone.addEventListener('drop', handleDrop);
    
    fileInput.addEventListener('change', handleFileSelect);
    
    // Select all checkbox
    document.getElementById('selectAllFiles').addEventListener('change', toggleSelectAll);
    
    // Delete selected button
    document.getElementById('deleteAllBtn').addEventListener('click', deleteSelectedFiles);
    
    // Search functionality
    document.getElementById('adminSearchInput').addEventListener('input', filterAdminFiles);
}

// Check if admin key is provided in URL
function checkAuthFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const keyFromUrl = urlParams.get('adminKey');
    
    if (keyFromUrl) {
        document.getElementById('adminKey').value = keyFromUrl;
        authenticate();
    }
}

// Authenticate admin
async function authenticate() {
    const keyInput = document.getElementById('adminKey');
    adminKey = keyInput.value.trim();
    
    if (!adminKey) {
        showAuthError('Please enter admin key');
        return;
    }
    
    try {
        // Test authentication by trying to fetch files
        const response = await fetch('/api/files', {
            headers: {
                'Authorization': adminKey
            }
        });
        
        if (response.status === 403) {
            showAuthError('Invalid admin key');
            return;
        }
        
        isAuthenticated = true;
        hideAuthSection();
        showAdminDashboard();
        loadAdminFiles();
        
    } catch (error) {
        console.error('Auth error:', error);
        showAuthError('Authentication failed');
    }
}

// Show authentication error
function showAuthError(message) {
    const errorDiv = document.getElementById('authError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

// Hide auth section and show dashboard
function hideAuthSection() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';
}

function showAdminDashboard() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';
}

// Drag and drop handlers
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    
    const files = Array.from(e.dataTransfer.files);
    uploadFiles(files);
}

// Handle file selection
function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    uploadFiles(files);
}

// Upload files
async function uploadFiles(files) {
    if (files.length === 0) return;
    
    const formData = new FormData();
    files.forEach(file => {
        formData.append('files', file);
    });
    
    // Add advanced options
    const isHidden = document.getElementById('uploadHidden').checked;
    const viewLimit = document.getElementById('uploadViewLimit').value;
    const password = document.getElementById('uploadPassword').value;
    
    if (isHidden) formData.append('isHidden', 'true');
    if (viewLimit) formData.append('viewLimit', viewLimit);
    if (password) formData.append('password', password);
    
    showUploadProgress();
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Authorization': adminKey
            },
            body: formData
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Upload failed');
        }
        
        showUploadSuccess(result.message);
        loadAdminFiles();
        
        // Reset file input
        document.getElementById('fileInput').value = '';
        
        // Reset advanced options
        document.getElementById('uploadHidden').checked = false;
        document.getElementById('uploadViewLimit').value = '';
        document.getElementById('uploadPassword').value = '';
        
    } catch (error) {
        console.error('Upload error:', error);
        showUploadError(error.message);
    }
}

// Show upload progress
function showUploadProgress() {
    document.getElementById('uploadProgress').style.display = 'block';
    document.getElementById('uploadResults').style.display = 'none';
    
    // Simulate progress (in real implementation, you'd track actual progress)
    const progressBar = document.querySelector('#uploadProgress .progress-bar');
    let progress = 0;
    
    const interval = setInterval(() => {
        progress += 10;
        progressBar.style.width = progress + '%';
        
        if (progress >= 90) {
            clearInterval(interval);
        }
    }, 100);
}

// Show upload success
function showUploadSuccess(message) {
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('uploadResults').style.display = 'block';
    document.getElementById('uploadSuccessMessage').textContent = message;
    
    setTimeout(() => {
        document.getElementById('uploadResults').style.display = 'none';
    }, 5000);
}

// Show upload error
function showUploadError(message) {
    document.getElementById('uploadProgress').style.display = 'none';
    
    const resultsDiv = document.getElementById('uploadResults');
    resultsDiv.innerHTML = `
        <div class="alert alert-danger">
            <i class="fas fa-exclamation-triangle me-2"></i>
            ${message}
        </div>
    `;
    resultsDiv.style.display = 'block';
    
    setTimeout(() => {
        resultsDiv.style.display = 'none';
    }, 5000);
}

// Load files for admin management
async function loadAdminFiles() {
    try {
        const response = await fetch('/api/files', {
            headers: {
                'Authorization': adminKey
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load files');
        }
        
        const files = await response.json();
        displayAdminFiles(files);
        
    } catch (error) {
        console.error('Error loading files:', error);
        showError('Failed to load files');
    }
}

// Display files in admin table
function displayAdminFiles(files) {
    const tbody = document.getElementById('filesTableBody');
    const noFilesDiv = document.getElementById('noAdminFiles');
    
    if (files.length === 0) {
        tbody.innerHTML = '';
        noFilesDiv.style.display = 'block';
        return;
    }
    
    noFilesDiv.style.display = 'none';
    
    tbody.innerHTML = files.map(file => `
        <tr>
            <td>
                <input type="checkbox" class="form-check-input file-select" value="${file.name}">
            </td>
            <td>
                <div class="d-flex align-items-center">
                    <i class="${getFileIcon(file.type).icon} me-2"></i>
                    <span title="${file.name}">${truncateFilename(file.originalName, 30)}</span>
                </div>
            </td>
            <td>${formatFileSize(file.size)}</td>
            <td>
                <span class="badge bg-secondary">${getFileTypeLabel(file.type)}</span>
            </td>
            <td>${formatDate(file.created)}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="downloadFile('${file.name}')">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteFile('${file.name}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
    
    // Add event listeners to checkboxes
    tbody.querySelectorAll('.file-select').forEach(checkbox => {
        checkbox.addEventListener('change', updateDeleteButton);
    });
}

// Get file type label
function getFileTypeLabel(mimeType) {
    if (!mimeType) return 'Unknown';
    
    if (mimeType.startsWith('image/')) return 'Image';
    if (mimeType.startsWith('video/')) return 'Video';
    if (mimeType.startsWith('audio/')) return 'Audio';
    if (mimeType.includes('pdf')) return 'PDF';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'Archive';
    if (mimeType.includes('document') || mimeType.includes('word')) return 'Document';
    if (mimeType.startsWith('text/')) return 'Text';
    
    return mimeType.split('/')[0] || 'File';
}

// Toggle select all files
function toggleSelectAll() {
    const selectAll = document.getElementById('selectAllFiles');
    const fileCheckboxes = document.querySelectorAll('.file-select');
    
    fileCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
    
    updateDeleteButton();
}

// Update delete button visibility
function updateDeleteButton() {
    const selectedFiles = document.querySelectorAll('.file-select:checked');
    const deleteBtn = document.getElementById('deleteAllBtn');
    
    if (selectedFiles.length > 0) {
        deleteBtn.style.display = 'inline-block';
    } else {
        deleteBtn.style.display = 'none';
    }
}

// Delete single file
function deleteFile(filename) {
    const modal = new bootstrap.Modal(document.getElementById('deleteModal'));
    const confirmText = document.getElementById('deleteConfirmText');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    
    confirmText.textContent = `Are you sure you want to delete "${filename}"?`;
    
    confirmBtn.onclick = async () => {
        try {
            const response = await fetch(`/api/files/${filename}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': adminKey
                }
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Delete failed');
            }
            
            modal.hide();
            loadAdminFiles();
            showSuccess('File deleted successfully');
            
        } catch (error) {
            console.error('Delete error:', error);
            showError('Failed to delete file: ' + error.message);
        }
    };
    
    modal.show();
}

// Delete selected files
function deleteSelectedFiles() {
    const selectedCheckboxes = document.querySelectorAll('.file-select:checked');
    
    if (selectedCheckboxes.length === 0) {
        return;
    }
    
    const filenames = Array.from(selectedCheckboxes).map(cb => cb.value);
    
    const modal = new bootstrap.Modal(document.getElementById('deleteModal'));
    const confirmText = document.getElementById('deleteConfirmText');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    
    confirmText.textContent = `Are you sure you want to delete ${filenames.length} selected file(s)?`;
    
    confirmBtn.onclick = async () => {
        try {
            const response = await fetch('/api/files', {
                method: 'DELETE',
                headers: {
                    'Authorization': adminKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ files: filenames })
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Delete failed');
            }
            
            modal.hide();
            loadAdminFiles();
            showSuccess(`${filenames.length} file(s) deleted successfully`);
            
            // Clear select all checkbox
            document.getElementById('selectAllFiles').checked = false;
            updateDeleteButton();
            
        } catch (error) {
            console.error('Delete error:', error);
            showError('Failed to delete files: ' + error.message);
        }
    };
    
    modal.show();
}

// Filter admin files
function filterAdminFiles() {
    const searchTerm = document.getElementById('adminSearchInput').value.toLowerCase();
    const rows = document.querySelectorAll('#filesTableBody tr');
    
    rows.forEach(row => {
        const filename = row.querySelector('td:nth-child(2)').textContent.toLowerCase();
        if (filename.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// Refresh file list
function refreshFileList() {
    loadAdminFiles();
}

// Download file (reuse from main.js)
function downloadFile(filename) {
    const link = document.createElement('a');
    link.href = `/api/download/${filename}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Utility functions (reuse from main.js)
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function truncateFilename(filename, maxLength = 20) {
    if (filename.length <= maxLength) return filename;
    const ext = filename.substring(filename.lastIndexOf('.'));
    const name = filename.substring(0, filename.lastIndexOf('.'));
    return name.substring(0, maxLength - ext.length - 3) + '...' + ext;
}

function getFileIcon(mimeType) {
    if (!mimeType) return { icon: 'fas fa-file', class: 'default' };
    
    if (mimeType.startsWith('image/')) {
        return { icon: 'fas fa-image', class: 'image' };
    } else if (mimeType.startsWith('video/')) {
        return { icon: 'fas fa-video', class: 'video' };
    } else if (mimeType.startsWith('audio/')) {
        return { icon: 'fas fa-music', class: 'audio' };
    } else if (mimeType.includes('pdf')) {
        return { icon: 'fas fa-file-pdf', class: 'document' };
    } else if (mimeType.includes('word') || mimeType.includes('document')) {
        return { icon: 'fas fa-file-word', class: 'document' };
    } else if (mimeType.includes('sheet') || mimeType.includes('excel')) {
        return { icon: 'fas fa-file-excel', class: 'document' };
    } else if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
        return { icon: 'fas fa-file-powerpoint', class: 'document' };
    } else if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) {
        return { icon: 'fas fa-file-archive', class: 'archive' };
    } else if (mimeType.startsWith('text/')) {
        return { icon: 'fas fa-file-alt', class: 'document' };
    } else {
        return { icon: 'fas fa-file', class: 'default' };
    }
}

function showSuccess(message) {
    // Simple alert for now - could be enhanced with toast notifications
    alert(message);
}

function showError(message) {
    alert('Error: ' + message);
}

// Advanced file options functionality
let currentAdvancedFile = null;

function showAdvancedOptions(filename) {
    currentAdvancedFile = filename;
    const modal = new bootstrap.Modal(document.getElementById('advancedOptionsModal'));
    
    // Set filename in modal
    document.getElementById('advancedFileName').textContent = filename;
    
    // Load current file settings
    loadFileSettings(filename);
    
    modal.show();
}

async function loadFileSettings(filename) {
    try {
        const response = await fetch('/api/files', {
            headers: {
                'Authorization': adminKey
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load file settings');
        }
        
        const files = await response.json();
        const file = files.find(f => f.name === filename);
        
        if (file) {
            // Update UI based on current settings
            updateAdvancedOptionsUI(file);
        }
        
    } catch (error) {
        console.error('Error loading file settings:', error);
        showError('Failed to load file settings');
    }
}

function updateAdvancedOptionsUI(file) {
    // Update hidden status
    const toggleBtn = document.getElementById('toggleHiddenBtn');
    const hiddenContainer = document.getElementById('hiddenLinkContainer');
    
    if (file.isHidden) {
        toggleBtn.innerHTML = '<i class="fas fa-toggle-on me-1"></i> Make Public';
        toggleBtn.className = 'btn btn-success btn-sm';
        if (file.hiddenToken) {
            document.getElementById('hiddenShareLink').value = `${window.location.origin}/api/download/${file.name}?token=${file.hiddenToken}`;
            hiddenContainer.style.display = 'block';
        }
    } else {
        toggleBtn.innerHTML = '<i class="fas fa-toggle-off me-1"></i> Make Hidden';
        toggleBtn.className = 'btn btn-outline-primary btn-sm';
        hiddenContainer.style.display = 'none';
    }
    
    // Update password status
    const removePasswordBtn = document.getElementById('removePasswordBtn');
    if (file.isPasswordProtected) {
        removePasswordBtn.style.display = 'inline-block';
    } else {
        removePasswordBtn.style.display = 'none';
    }
    
    // Update view count and limit
    document.getElementById('currentViewCount').textContent = file.viewCount || 0;
    document.getElementById('currentViewLimit').textContent = file.viewLimit || 'None';
    document.getElementById('viewLimitInput').value = file.viewLimit || '';
}

// Setup event listeners for advanced options
document.addEventListener('DOMContentLoaded', function() {
    // Toggle hidden status
    document.getElementById('toggleHiddenBtn').addEventListener('click', async function() {
        if (!currentAdvancedFile) return;
        
        try {
            const response = await fetch(`/api/files/${currentAdvancedFile}/toggle-hidden`, {
                method: 'POST',
                headers: {
                    'Authorization': adminKey
                }
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Failed to toggle hidden status');
            }
            
            showSuccess(result.message);
            loadFileSettings(currentAdvancedFile);
            loadAdminFiles();
            
        } catch (error) {
            console.error('Error toggling hidden status:', error);
            showError(error.message);
        }
    });
    
    // Set password
    document.getElementById('setPasswordBtn').addEventListener('click', async function() {
        if (!currentAdvancedFile) return;
        
        const password = document.getElementById('filePassword').value.trim();
        if (!password) {
            showError('Please enter a password');
            return;
        }
        
        try {
            const response = await fetch(`/api/files/${currentAdvancedFile}/set-password`, {
                method: 'POST',
                headers: {
                    'Authorization': adminKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Failed to set password');
            }
            
            showSuccess(result.message);
            document.getElementById('filePassword').value = '';
            loadFileSettings(currentAdvancedFile);
            loadAdminFiles();
            
        } catch (error) {
            console.error('Error setting password:', error);
            showError(error.message);
        }
    });
    
    // Remove password
    document.getElementById('removePasswordBtn').addEventListener('click', async function() {
        if (!currentAdvancedFile) return;
        
        try {
            const response = await fetch(`/api/files/${currentAdvancedFile}/set-password`, {
                method: 'POST',
                headers: {
                    'Authorization': adminKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password: '' })
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Failed to remove password');
            }
            
            showSuccess(result.message);
            loadFileSettings(currentAdvancedFile);
            loadAdminFiles();
            
        } catch (error) {
            console.error('Error removing password:', error);
            showError(error.message);
        }
    });
    
    // Set view limit
    document.getElementById('setViewLimitBtn').addEventListener('click', async function() {
        if (!currentAdvancedFile) return;
        
        const viewLimit = parseInt(document.getElementById('viewLimitInput').value);
        if (isNaN(viewLimit) || viewLimit < 1) {
            showError('Please enter a valid view limit (1 or greater)');
            return;
        }
        
        try {
            const response = await fetch(`/api/files/${currentAdvancedFile}/set-view-limit`, {
                method: 'POST',
                headers: {
                    'Authorization': adminKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ viewLimit })
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Failed to set view limit');
            }
            
            showSuccess(result.message);
            loadFileSettings(currentAdvancedFile);
            loadAdminFiles();
            
        } catch (error) {
            console.error('Error setting view limit:', error);
            showError(error.message);
        }
    });
    
    // Remove view limit
    document.getElementById('removeViewLimitBtn').addEventListener('click', async function() {
        if (!currentAdvancedFile) return;
        
        try {
            const response = await fetch(`/api/files/${currentAdvancedFile}/set-view-limit`, {
                method: 'POST',
                headers: {
                    'Authorization': adminKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ viewLimit: null })
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Failed to remove view limit');
            }
            
            showSuccess(result.message);
            loadFileSettings(currentAdvancedFile);
            loadAdminFiles();
            
        } catch (error) {
            console.error('Error removing view limit:', error);
            showError(error.message);
        }
    });
    
    // Reset view count
    document.getElementById('resetViewCountBtn').addEventListener('click', async function() {
        if (!currentAdvancedFile) return;
        
        if (!confirm('Are you sure you want to reset the view count for this file?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/files/${currentAdvancedFile}/reset-views`, {
                method: 'POST',
                headers: {
                    'Authorization': adminKey
                }
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Failed to reset view count');
            }
            
            showSuccess(result.message);
            loadFileSettings(currentAdvancedFile);
            loadAdminFiles();
            
        } catch (error) {
            console.error('Error resetting view count:', error);
            showError(error.message);
        }
    });
    
    // Generate share link
    document.getElementById('generateShareLinkBtn').addEventListener('click', async function() {
        if (!currentAdvancedFile) return;
        
        try {
            const response = await fetch(`/api/files/${currentAdvancedFile}/generate-share-link`, {
                method: 'POST',
                headers: {
                    'Authorization': adminKey
                }
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Failed to generate share link');
            }
            
            document.getElementById('generatedShareLink').value = result.shareUrl;
            document.getElementById('shareLinkContainer').style.display = 'block';
            
        } catch (error) {
            console.error('Error generating share link:', error);
            showError(error.message);
        }
    });
});

// Copy to clipboard function
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showSuccess('Copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        showError('Failed to copy to clipboard');
    });
}