// Main JavaScript for file sharing platform

let allFiles = [];
let selectedFiles = new Set();
let downloadCount = 0;
let isAdvancedSearch = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    loadFiles();
    setupEventListeners();
    loadStorageStats();
});

// Setup event listeners
function setupEventListeners() {
    // Search functionality
    document.getElementById('searchInput').addEventListener('input', debounce(filterFiles, 300));
    document.getElementById('typeFilter').addEventListener('change', filterFiles);
    document.getElementById('sortFilter').addEventListener('change', sortFiles);
    
    // Advanced search
    document.getElementById('advancedSearchBtn').addEventListener('click', toggleAdvancedSearch);
    document.getElementById('applyAdvancedSearch').addEventListener('click', applyAdvancedSearch);
    document.getElementById('clearAdvancedSearch').addEventListener('click', clearAdvancedSearch);
    
    // Bulk actions
    document.getElementById('downloadSelectedBtn').addEventListener('click', downloadSelectedFiles);
    document.getElementById('shareSelectedBtn').addEventListener('click', shareSelectedFiles);
    document.getElementById('clearSelectionBtn').addEventListener('click', clearSelection);
    
    // Share modal
    document.getElementById('copyAllLinksBtn').addEventListener('click', copyAllLinks);
}

// Load files from server
async function loadFiles() {
    try {
        showLoadingSpinner();
        const response = await fetch('/api/files');
        
        if (!response.ok) {
            throw new Error('Failed to load files');
        }
        
        allFiles = await response.json();
        displayFiles(allFiles);
        updateFileStats();
        hideLoadingSpinner();
        
    } catch (error) {
        console.error('Error loading files:', error);
        showError('Failed to load files. Please try again.');
        hideLoadingSpinner();
    }
}

// Load storage statistics
async function loadStorageStats() {
    try {
        const response = await fetch('/api/files');
        if (response.ok) {
            const files = await response.json();
            updateFileStats(files);
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Update file statistics display
function updateFileStats(files = allFiles) {
    const totalFiles = files.length;
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const latestFile = files.length > 0 ? files.reduce((latest, file) => 
        new Date(file.created) > new Date(latest.created) ? file : latest
    ) : null;
    
    document.getElementById('totalFiles').textContent = totalFiles;
    document.getElementById('totalSize').textContent = formatFileSize(totalSize);
    document.getElementById('downloadCount').textContent = downloadCount;
    document.getElementById('latestUpload').textContent = latestFile ? 
        formatDate(latestFile.created) : 'Never';
}

// Display files in grid
function displayFiles(files) {
    const container = document.getElementById('filesContainer');
    const noFilesMessage = document.getElementById('noFilesMessage');
    
    if (files.length === 0) {
        container.innerHTML = '';
        noFilesMessage.style.display = 'block';
        return;
    }
    
    noFilesMessage.style.display = 'none';
    
    container.innerHTML = files.map(file => createFileCard(file)).join('');
    
    // Add event listeners to file cards
    container.querySelectorAll('.file-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.file-checkbox') && !e.target.closest('.btn')) {
                const filename = card.dataset.filename;
                const file = files.find(f => f.name === filename);
                if (file && isPreviewable(file)) {
                    showPreview(file);
                } else {
                    downloadFile(filename);
                }
            }
        });
    });
    
    // Add event listeners to checkboxes
    container.querySelectorAll('.file-checkbox input').forEach(checkbox => {
        checkbox.addEventListener('change', handleFileSelection);
    });
}

// Create file card HTML
function createFileCard(file) {
    const fileIcon = getFileIcon(file.type);
    const fileSize = formatFileSize(file.size);
    const fileDate = formatDate(file.created);
    const isSelected = selectedFiles.has(file.name);
    
    return `
        <div class="col-md-6 col-lg-4 col-xl-3 mb-4">
            <div class="card file-card file-card-appear ${isSelected ? 'selected' : ''}" data-filename="${file.name}">
                <div class="file-checkbox">
                    <input type="checkbox" class="form-check-input" ${isSelected ? 'checked' : ''} value="${file.name}">
                </div>
                <div class="card-body text-center">
                    <div class="file-icon ${fileIcon.class}">
                        <i class="${fileIcon.icon}"></i>
                    </div>
                    <h6 class="card-title" title="${file.originalName}">${truncateFilename(file.originalName)}</h6>
                    <p class="file-size">${fileSize}</p>
                    <p class="file-date">${fileDate}</p>
                    <div class="btn-group btn-file-action" role="group">
                        ${isPreviewable(file) ? `
                            <button class="btn btn-outline-primary btn-sm" onclick="event.stopPropagation(); showPreview(${JSON.stringify(file).replace(/"/g, '&quot;')})">
                                <i class="fas fa-eye"></i>
                            </button>
                        ` : ''}
                        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); downloadFile('${file.name}')">
                            <i class="fas fa-download"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Get file icon based on type
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

// Check if file is previewable
function isPreviewable(file) {
    if (!file.type) return false;
    return file.type.startsWith('image/') || file.type.startsWith('text/');
}

// Show file preview
async function showPreview(file) {
    const modal = new bootstrap.Modal(document.getElementById('previewModal'));
    const title = document.getElementById('previewModalTitle');
    const body = document.getElementById('previewModalBody');
    const downloadBtn = document.getElementById('downloadFromPreview');
    
    title.textContent = file.originalName;
    body.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';
    
    downloadBtn.onclick = () => downloadFile(file.name);
    
    modal.show();
    
    try {
        const response = await fetch(`/api/preview/${file.name}`);
        
        if (!response.ok) {
            throw new Error('Preview not available');
        }
        
        if (file.type.startsWith('image/')) {
            const imageUrl = `/api/preview/${file.name}`;
            body.innerHTML = `<img src="${imageUrl}" class="img-fluid" alt="${file.originalName}">`;
        } else if (file.type.startsWith('text/')) {
            const text = await response.text();
            body.innerHTML = `<pre class="text-start">${escapeHtml(text)}</pre>`;
        }
        
    } catch (error) {
        body.innerHTML = `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Preview not available for this file type.
            </div>
        `;
    }
}

// Download single file with progress tracking
function downloadFile(filename) {
    downloadCount++;
    updateFileStats();
    
    const link = document.createElement('a');
    link.href = `/api/download/${filename}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Store download count in localStorage
    localStorage.setItem('downloadCount', downloadCount);
}

// Handle file selection
function handleFileSelection(event) {
    const filename = event.target.value;
    const card = event.target.closest('.file-card');
    
    if (event.target.checked) {
        selectedFiles.add(filename);
        card.classList.add('selected');
    } else {
        selectedFiles.delete(filename);
        card.classList.remove('selected');
    }
    
    updateBulkActions();
}

// Update bulk actions display
function updateBulkActions() {
    const bulkActions = document.getElementById('bulkActions');
    const selectedCount = document.getElementById('selectedCount');
    
    if (selectedFiles.size > 0) {
        bulkActions.style.display = 'block';
        selectedCount.textContent = selectedFiles.size;
    } else {
        bulkActions.style.display = 'none';
    }
}

// Download selected files
async function downloadSelectedFiles() {
    if (selectedFiles.size === 0) return;
    
    const modal = new bootstrap.Modal(document.getElementById('downloadModal'));
    const progressBar = document.querySelector('#downloadModal .progress-bar');
    const status = document.getElementById('downloadStatus');
    
    modal.show();
    
    try {
        status.textContent = 'Preparing download...';
        progressBar.style.width = '50%';
        
        const response = await fetch('/api/download-multiple', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: Array.from(selectedFiles)
            })
        });
        
        if (!response.ok) {
            throw new Error('Download failed');
        }
        
        progressBar.style.width = '100%';
        status.textContent = 'Download complete!';
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'selected_files.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        setTimeout(() => {
            modal.hide();
            clearSelection();
        }, 1000);
        
    } catch (error) {
        console.error('Download error:', error);
        status.textContent = 'Download failed. Please try again.';
        progressBar.classList.add('bg-danger');
    }
}

// Clear selection
function clearSelection() {
    selectedFiles.clear();
    document.querySelectorAll('.file-card').forEach(card => {
        card.classList.remove('selected');
    });
    document.querySelectorAll('.file-checkbox input').forEach(checkbox => {
        checkbox.checked = false;
    });
    updateBulkActions();
}

// Filter files
function filterFiles() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const typeFilter = document.getElementById('typeFilter').value;
    
    let filteredFiles = allFiles.filter(file => {
        const matchesSearch = file.originalName.toLowerCase().includes(searchTerm);
        const matchesType = !typeFilter || getFileCategory(file.type) === typeFilter;
        return matchesSearch && matchesType;
    });
    
    displayFiles(filteredFiles);
}

// Get file category for filtering
function getFileCategory(mimeType) {
    if (!mimeType) return 'other';
    
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) return 'archive';
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text') || 
        mimeType.includes('sheet') || mimeType.includes('presentation')) return 'document';
    
    return 'other';
}

// Utility functions
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoadingSpinner() {
    document.getElementById('loadingSpinner').style.display = 'block';
    document.getElementById('filesContainer').style.display = 'none';
}

function hideLoadingSpinner() {
    document.getElementById('loadingSpinner').style.display = 'none';
    document.getElementById('filesContainer').style.display = 'block';
}

function showError(message) {
    console.error(message);
    showToast(message, 'error');
}

// Advanced search functionality
function toggleAdvancedSearch() {
    const panel = document.getElementById('advancedSearchPanel');
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
    
    const btn = document.getElementById('advancedSearchBtn');
    btn.innerHTML = isVisible ? '<i class="fas fa-filter"></i>' : '<i class="fas fa-times"></i>';
}

function applyAdvancedSearch() {
    const searchTerm = document.getElementById('searchInput').value;
    const typeFilter = document.getElementById('typeFilter').value;
    const sizeOperator = document.getElementById('sizeOperator').value;
    const sizeValue = parseFloat(document.getElementById('sizeValue').value);
    const dateOperator = document.getElementById('dateOperator').value;
    const dateValue = document.getElementById('dateValue').value;
    
    const params = new URLSearchParams();
    if (searchTerm) params.append('q', searchTerm);
    if (typeFilter) params.append('type', typeFilter);
    if (sizeValue) params.append('size', `${sizeOperator}:${sizeValue * 1024 * 1024}`);
    if (dateValue) params.append('date', `${dateOperator}:${dateValue}`);
    
    isAdvancedSearch = true;
    performAdvancedSearch(params);
}

function clearAdvancedSearch() {
    document.getElementById('sizeValue').value = '';
    document.getElementById('dateValue').value = '';
    document.getElementById('sizeOperator').value = 'gt';
    document.getElementById('dateOperator').value = 'after';
    
    isAdvancedSearch = false;
    filterFiles();
}

async function performAdvancedSearch(params) {
    try {
        showLoadingSpinner();
        const response = await fetch(`/api/search?${params}`);
        
        if (!response.ok) {
            throw new Error('Search failed');
        }
        
        const results = await response.json();
        displayFiles(results);
        hideLoadingSpinner();
        
    } catch (error) {
        console.error('Search error:', error);
        showError('Advanced search failed. Please try again.');
        hideLoadingSpinner();
    }
}

// Sort files functionality
function sortFiles() {
    const sortBy = document.getElementById('sortFilter').value;
    const sortedFiles = [...allFiles].sort((a, b) => {
        switch (sortBy) {
            case 'name':
                return a.originalName.localeCompare(b.originalName);
            case 'size':
                return b.size - a.size;
            case 'date':
                return new Date(b.created) - new Date(a.created);
            case 'type':
                return (a.type || '').localeCompare(b.type || '');
            default:
                return 0;
        }
    });
    
    displayFiles(sortedFiles);
}

// Share selected files
function shareSelectedFiles() {
    if (selectedFiles.size === 0) return;
    
    const modal = new bootstrap.Modal(document.getElementById('shareModal'));
    const container = document.getElementById('shareLinksContainer');
    
    let linksHtml = '';
    selectedFiles.forEach(filename => {
        const file = allFiles.find(f => f.name === filename);
        if (file) {
            const shareUrl = `${window.location.origin}/api/download/${filename}`;
            linksHtml += `
                <div class="mb-3">
                    <label class="form-label">${file.originalName}</label>
                    <div class="input-group">
                        <input type="text" class="form-control" value="${shareUrl}" readonly>
                        <button class="btn btn-outline-secondary" type="button" onclick="copyToClipboard('${shareUrl}')">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                </div>
            `;
        }
    });
    
    container.innerHTML = linksHtml;
    modal.show();
}

// Copy all links to clipboard
function copyAllLinks() {
    const links = [];
    selectedFiles.forEach(filename => {
        const file = allFiles.find(f => f.name === filename);
        if (file) {
            links.push(`${file.originalName}: ${window.location.origin}/api/download/${filename}`);
        }
    });
    
    copyToClipboard(links.join('\n'));
}

// Copy to clipboard utility
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        showToast('Failed to copy to clipboard', 'error');
    });
}

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Toast notification system
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-bg-${type} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    
    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
        document.body.appendChild(toastContainer);
    }
    
    toastContainer.appendChild(toast);
    
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
    
    // Remove toast element after it's hidden
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}

// Initialize download count from localStorage
document.addEventListener('DOMContentLoaded', function() {
    downloadCount = parseInt(localStorage.getItem('downloadCount') || '0');
});
