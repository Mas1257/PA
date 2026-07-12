// ==UserScript==
// @name         PA
// @version      1.07
// @lastupdate   2026-07-06
// @description  Barcode management
// @author       @zarkarma
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        unsafeWindow
// @connect      api.quotable.io
// @require      https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js
// @require      https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js
// @require      https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
// ==/UserScript==
/* global JsBarcode, QRCode, JSZip */
(function () {
    'use strict';

    const SCRIPT_VERSION = (() => {
        if (typeof GM_info === 'object' && GM_info && GM_info.script && GM_info.script.version) {
            return GM_info.script.version;
        }
        if (typeof GM_info === 'object' && GM_info && typeof GM_info.scriptMetaStr === 'string') {
            const match = GM_info.scriptMetaStr.match(/@version\s+([^\s]+)/i);
            if (match && match[1]) return match[1];
        }
        return 'unknown';
    })();

    const SCRIPT_LAST_UPDATE = (() => {
        if (typeof GM_info === 'object' && GM_info && typeof GM_info.scriptMetaStr === 'string') {
            const match = GM_info.scriptMetaStr.match(/@lastupdate\s+([^\s]+)/i);
            if (match && match[1]) return match[1];
        }
        return 'unknown';
    })();

    const STORAGE_KEYS = Object.freeze({
        // Core
        UPDATE_CHECK: 'PA',

        // Cache
        CLIPBOARD_CACHE: 'bm_last_copied',
        QR_PREVIEW_CACHE: 'bm_qr_preview_cache',
        QR_PREFETCH_LAST_RUN: 'bm_qr_preview_prefetch_last_run',

        // Barcode
        FOLDERS: 'bm_folders',
        SUBFOLDERS: 'bm_subfolders',
        BARCODES: 'bm_barcodes',

        // Bookmarks
        BOOKMARKS: 'bm_bookmarks',
        BOOKMARK_FOLDERS: 'bm_bookmark_folders',
        BOOKMARK_SUBFOLDERS: 'bm_bookmark_subfolders',
        BOOKMARK_DEFAULTS_MIGRATION: 'bm_bookmark_no_defaults_migrated',

        // Notebook
        NOTES: 'bm_notes',
        NOTE_FOLDERS: 'bm_note_folders',

        // Todo
        TASKS: 'bm_tasks',
        TODO_PROJECTS: 'bm_todo_projects',
        WELLNESS_SETTINGS: 'bm_wellness_settings',

        // Print
        PRINT_SERVER_OVERRIDE: 'bm_print_server_override',
        PRINT_LOG: 'bm_print_log',

        // UI
        PANEL_SIZE: 'bm_panel_size',
        BARCODE_MODAL: 'bm_barcode_modal',

        // Workspace
        WORKSPACE_METADATA: 'bm_workspace_metadata',

        // External
        NEW_RODEO_SETTINGS: 'newRodeo-settings'
    });

    const WORKSPACE_DATA_STORAGE_KEYS = Object.freeze([
        STORAGE_KEYS.FOLDERS,
        STORAGE_KEYS.SUBFOLDERS,
        STORAGE_KEYS.BARCODES,
        STORAGE_KEYS.BOOKMARKS,
        STORAGE_KEYS.BOOKMARK_FOLDERS,
        STORAGE_KEYS.BOOKMARK_SUBFOLDERS,
        STORAGE_KEYS.NOTES,
        STORAGE_KEYS.NOTE_FOLDERS,
        STORAGE_KEYS.TASKS,
        STORAGE_KEYS.TODO_PROJECTS,
        STORAGE_KEYS.WELLNESS_SETTINGS,
        STORAGE_KEYS.PRINT_SERVER_OVERRIDE,
        STORAGE_KEYS.PRINT_LOG,
        STORAGE_KEYS.NEW_RODEO_SETTINGS
    ]);

    // --- Update Check ---
    (() => {
        const ScriptName = STORAGE_KEYS.UPDATE_CHECK;
        const CHECK_INTERVAL_MS = 72000000; // 20 hours
        if (typeof GM_getValue !== 'function' || typeof GM_setValue !== 'function' || typeof GM_xmlhttpRequest !== 'function') return;

        let lastUpdated;
        try {
            const stored = GM_getValue(ScriptName);
            if (stored) lastUpdated = parseInt(stored, 10);
        } catch { }

        if (typeof lastUpdated === 'undefined' || Number.isNaN(lastUpdated) || (Date.now() - lastUpdated) > CHECK_INTERVAL_MS) {
            const scriptUpdateURL = GM_info?.scriptUpdateURL || GM_info?.script?.updateURL;
            const scriptVersion = GM_info?.script?.version || SCRIPT_VERSION;
            if (!scriptUpdateURL) return;

            GM_xmlhttpRequest({
                method: 'GET',
                url: scriptUpdateURL,
                revalidate: true,
                nocache: true,
                onload: (response) => {
                    try {
                        GM_setValue(ScriptName, Date.now());
                    } catch { }
                    const versionMtch = response.responseText.match(/\/\/\s+@version\s+([0-9.]+)/i);
                    if (versionMtch && versionMtch.length > 1) {
                        if (versionMtch[1] !== String(scriptVersion)) {
                            window.location.href = scriptUpdateURL;
                        }
                    }
                },
                onerror: function () { },
                ontimeout: function () { }
            });
        }
    })();


    // ============================================================
    // SECTION: Storage, Shared Cache, and Cross-Tab Sync
    // ------------------------------------------------------------
    // Keep this block early. Most data, rendering, import/export,
    // and print features depend on these GM/localStorage helpers.
    // ============================================================

    // --- Storage Service ---
    const StorageService = (() => {
        function gmGet(key, fallback = null) {
            let cached;
            try {
                const raw = localStorage.getItem(key);
                if (raw != null) cached = JSON.parse(raw);
            } catch { }

            if (typeof GM_getValue === "function") {
                try {
                    const val = GM_getValue(key, undefined);
                    if (val && typeof val.then === 'function') {
                        return cached !== undefined ? cached : fallback;
                    }
                    if (val !== undefined) {
                        try {
                            localStorage.setItem(key, JSON.stringify(val));
                        } catch { }
                        return val;
                    }
                    if (cached !== undefined && typeof GM_setValue === "function") {
                        try {
                            GM_setValue(key, cached);
                        } catch { }
                    }
                } catch { }
            }

            return cached !== undefined ? cached : fallback;
        }

        function gmSet(key, value) {
            if (typeof GM_setValue === "function") {
                try {
                    GM_setValue(key, value);
                } catch { }
            }
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch { }
            try {
                window.dispatchEvent(new CustomEvent('pa:storage-changed', { detail: { key } }));
            } catch { }
        }

        function updateLocalCache(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch { }
        }

        function setBarcodesCache(list) {
            barcodesCache = Array.isArray(list) ? list : [];
            barcodesCacheDirty = false;
        }

        function setFoldersCache(list) {
            foldersCache = Array.isArray(list) ? list : [];
            foldersCacheDirty = false;
        }

        function invalidateBarcodesCache() {
            barcodesCacheDirty = true;
        }

        function invalidateFoldersCache() {
            foldersCacheDirty = true;
        }

        function registerCacheInvalidationListeners() {
            if (typeof GM_addValueChangeListener === 'function') {
                GM_addValueChangeListener(STORAGE_KEYS.BARCODES, () => invalidateBarcodesCache());
                GM_addValueChangeListener(STORAGE_KEYS.FOLDERS, () => invalidateFoldersCache());
            }
        }

        function registerRuntimeSync({ renderFolders, renderNotes, updateFooterCount, scheduleQrPreviewPrefetch }) {
            if (typeof GM_addValueChangeListener === "function") {
                GM_addValueChangeListener(STORAGE_KEYS.FOLDERS, function (_name, _oldValue, newValue, remote) {
                    if (!remote) return;
                    updateLocalCache(STORAGE_KEYS.FOLDERS, newValue);
                    renderFolders({ backgroundSync: true });
                    if (typeof renderNotes === 'function') renderNotes({ backgroundSync: true });
                    updateFooterCount();
                });
                GM_addValueChangeListener(STORAGE_KEYS.BARCODES, function (_name, _oldValue, newValue, remote) {
                    if (!remote) return;
                    updateLocalCache(STORAGE_KEYS.BARCODES, newValue);
                    renderFolders({ backgroundSync: true });
                    updateFooterCount();
                    scheduleQrPreviewPrefetch();
                });
                GM_addValueChangeListener(STORAGE_KEYS.NOTES, function (_name, _oldValue, newValue, remote) {
                    if (!remote) return;
                    updateLocalCache(STORAGE_KEYS.NOTES, newValue);
                    if (typeof renderNotes === 'function') renderNotes({ backgroundSync: true });
                    updateFooterCount();
                });
                GM_addValueChangeListener(STORAGE_KEYS.NOTE_FOLDERS, function (_name, _oldValue, newValue, remote) {
                    if (!remote) return;
                    updateLocalCache(STORAGE_KEYS.NOTE_FOLDERS, newValue);
                    if (typeof renderNotes === 'function') renderNotes({ backgroundSync: true });
                    updateFooterCount();
                });
            }

            window.addEventListener('storage', function (e) {
                if (e.key === STORAGE_KEYS.FOLDERS || e.key === STORAGE_KEYS.BARCODES) {
                    renderFolders({ backgroundSync: true });
                    if (typeof renderNotes === 'function' && e.key === STORAGE_KEYS.FOLDERS) renderNotes({ backgroundSync: true });
                    updateFooterCount();
                    if (e.key === STORAGE_KEYS.BARCODES) {
                        scheduleQrPreviewPrefetch();
                    }
                } else if (e.key === STORAGE_KEYS.NOTES || e.key === STORAGE_KEYS.NOTE_FOLDERS) {
                    if (typeof renderNotes === 'function') renderNotes({ backgroundSync: true });
                    updateFooterCount();
                }
            });
        }

        return Object.freeze({
            gmGet,
            gmSet,
            updateLocalCache,
            setBarcodesCache,
            setFoldersCache,
            invalidateBarcodesCache,
            invalidateFoldersCache,
            registerCacheInvalidationListeners,
            registerRuntimeSync
        });
    })();

    // Compatibility facades: keep existing callers stable while StorageService owns the implementation.
    function gmGet(key, fallback = null) {
        return StorageService.gmGet(key, fallback);
    }

    function gmSet(key, value) {
        StorageService.gmSet(key, value);
    }

    //////////////////////////////////////////////////////////////////////
    // Workspace Foundation
    //////////////////////////////////////////////////////////////////////
    // Workspace architecture primitives described in Workspace_Architecture
    // v1.0. The MVP enables only Settings status, connect, disconnect, and
    // manual Save Now/Restore plus rotating automatic snapshots. It does not
    // enable backup migration, cloud providers, or feature-module integration.

    /**
     * Workspace lifecycle states.
     *
     * These states are intentionally small for the foundation patch. Future
     * phases may add more detailed status values only through an approved
     * Workspace architecture update.
     */
    const WorkspaceState = Object.freeze({
        DISCONNECTED: 'DISCONNECTED',
        CONNECTING: 'CONNECTING',
        CONNECTED: 'CONNECTED',
        PERMISSION_REQUIRED: 'PERMISSION_REQUIRED',
        READY: 'READY',
        ERROR: 'ERROR'
    });

    const WORKSPACE_PROVIDER_LOCAL = 'local-file-system';
    const WORKSPACE_PERMISSION_MODE = 'readwrite';
    const WORKSPACE_IDB = Object.freeze({
        DB_NAME: 'pa-workspace-db',
        DB_VERSION: 1,
        STORE_NAME: 'workspace-handles',
        DEFAULT_HANDLE_ID: 'default'
    });
    const WORKSPACE_FOLDER_NAME = 'PA';
    const WORKSPACE_FILE_NAME = 'workspace.pa';
    const WORKSPACE_BACKUP_FOLDER_NAME = 'backups';
    const WORKSPACE_SNAPSHOT_PREFIX = 'Snapshot_';
    const WORKSPACE_SNAPSHOT_SUFFIX = '.pa';
    const WORKSPACE_AUTOSAVE_INTERVAL_MS = 10 * 60 * 1000;
    const WORKSPACE_AUTOSAVE_WATCHDOG_MS = 60 * 1000;
    const WORKSPACE_MAX_SNAPSHOTS = 10;

    const WorkspaceDiagnostics = (() => {
        const PREFIX = '[PA Workspace]';

        /**
         * Write internal debug diagnostics only.
         * This has no UI side effect and is not consumed by feature modules.
         */
        function debug(message, details = null) {
            try {
                if (details == null) console.debug(PREFIX, message);
                else console.debug(PREFIX, message, details);
            } catch { }
        }

        /**
         * Write internal warning diagnostics only.
         * This has no UI side effect and is not consumed by feature modules.
         */
        function warn(message, details = null) {
            try {
                if (details == null) console.warn(PREFIX, message);
                else console.warn(PREFIX, message, details);
            } catch { }
        }

        /**
         * Write internal error diagnostics only.
         * This has no UI side effect and is not consumed by feature modules.
         */
        function error(message, details = null) {
            try {
                if (details == null) console.error(PREFIX, message);
                else console.error(PREFIX, message, details);
            } catch { }
        }

        return Object.freeze({ debug, warn, error });
    })();

    function createWorkspaceError(message, code = 'WORKSPACE_ERROR', cause = null) {
        const err = new Error(message);
        err.code = code;
        if (cause) err.cause = cause;
        return err;
    }

    function openWorkspaceHandleDb() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                reject(createWorkspaceError('IndexedDB is not available.', 'WORKSPACE_IDB_UNSUPPORTED'));
                return;
            }

            let request;
            try {
                request = indexedDB.open(WORKSPACE_IDB.DB_NAME, WORKSPACE_IDB.DB_VERSION);
            } catch (err) {
                reject(createWorkspaceError('Failed to open Workspace IndexedDB.', 'WORKSPACE_IDB_OPEN_FAILED', err));
                return;
            }

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(WORKSPACE_IDB.STORE_NAME)) {
                    db.createObjectStore(WORKSPACE_IDB.STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(createWorkspaceError('Workspace IndexedDB open failed.', 'WORKSPACE_IDB_OPEN_FAILED', request.error));
            request.onblocked = () => reject(createWorkspaceError('Workspace IndexedDB open was blocked.', 'WORKSPACE_IDB_BLOCKED'));
        });
    }

    function workspaceTransactionComplete(tx) {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(createWorkspaceError('Workspace IndexedDB transaction failed.', 'WORKSPACE_IDB_TRANSACTION_FAILED', tx.error));
            tx.onabort = () => reject(createWorkspaceError('Workspace IndexedDB transaction was aborted.', 'WORKSPACE_IDB_TRANSACTION_ABORTED', tx.error));
        });
    }

    async function getWorkspaceHandleRecord() {
        const db = await openWorkspaceHandleDb();
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(WORKSPACE_IDB.STORE_NAME, 'readonly');
                const store = tx.objectStore(WORKSPACE_IDB.STORE_NAME);
                const request = store.get(WORKSPACE_IDB.DEFAULT_HANDLE_ID);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(createWorkspaceError('Failed to read Workspace handle.', 'WORKSPACE_IDB_READ_FAILED', request.error));
            });
        } finally {
            db.close();
        }
    }

    async function putWorkspaceHandleRecord(directoryHandle) {
        const db = await openWorkspaceHandleDb();
        try {
            const tx = db.transaction(WORKSPACE_IDB.STORE_NAME, 'readwrite');
            const store = tx.objectStore(WORKSPACE_IDB.STORE_NAME);
            store.put({
                id: WORKSPACE_IDB.DEFAULT_HANDLE_ID,
                provider: WORKSPACE_PROVIDER_LOCAL,
                directoryHandle,
                savedAt: new Date().toISOString()
            });
            await workspaceTransactionComplete(tx);
        } finally {
            db.close();
        }
    }

    async function deleteWorkspaceHandleRecord() {
        const db = await openWorkspaceHandleDb();
        try {
            const tx = db.transaction(WORKSPACE_IDB.STORE_NAME, 'readwrite');
            const store = tx.objectStore(WORKSPACE_IDB.STORE_NAME);
            store.delete(WORKSPACE_IDB.DEFAULT_HANDLE_ID);
            await workspaceTransactionComplete(tx);
        } finally {
            db.close();
        }
    }

    /**
     * WorkspaceProvider interface.
     *
     * Providers must implement the methods below. The foundation patch ships
     * only LocalWorkspaceProvider for Chromium File System Access API support.
     *
    * Future TODOs intentionally not implemented here:
     * - TODO(Workspace Phase 6): enable snapshots.
     * - TODO(Workspace Phase 10): register cloud providers behind this boundary.
     */

    const LocalWorkspaceProvider = (() => {
        let directoryHandle = null;

        /**
         * Return true only when Chromium File System Access API and IndexedDB
         * are available. Firefox and unsupported browsers return false.
         */
        function isSupported() {
            const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
            if (/Firefox|FxiOS/i.test(ua)) return false;
            return typeof window !== 'undefined'
                && typeof window.showDirectoryPicker === 'function'
                && typeof indexedDB !== 'undefined';
        }

        /**
         * Ask the user to choose a local workspace directory.
         *
         * This method only returns and stores the in-memory DirectoryHandle.
         * Persisting the handle is owned by WorkspaceService.saveHandle().
         */
        async function connect() {
            if (!isSupported()) {
                throw createWorkspaceError('Local Workspace provider is unsupported in this browser.', 'WORKSPACE_UNSUPPORTED');
            }
            directoryHandle = await window.showDirectoryPicker({ mode: WORKSPACE_PERMISSION_MODE });
            return directoryHandle;
        }

        /**
         * Restore the persisted DirectoryHandle from IndexedDB.
         *
         * This does not request permission and does not read or write files.
         */
        async function restore() {
            const record = await getWorkspaceHandleRecord();
            directoryHandle = record?.directoryHandle || null;
            return directoryHandle;
        }

        /**
         * Disconnect this provider for the current runtime session.
         *
         * This does not clear the persisted handle; WorkspaceService.clearHandle()
         * owns persisted-handle removal.
         */
        async function disconnect() {
            directoryHandle = null;
            return true;
        }

        /**
         * Query read/write permission for the active DirectoryHandle.
         */
        async function queryPermission(mode = WORKSPACE_PERMISSION_MODE) {
            if (!directoryHandle || typeof directoryHandle.queryPermission !== 'function') return 'denied';
            try {
                return await directoryHandle.queryPermission({ mode });
            } catch (err) {
                WorkspaceDiagnostics.warn('Workspace queryPermission failed.', err);
                return 'denied';
            }
        }

        /**
         * Request read/write permission for the active DirectoryHandle.
         *
         * This must be called from a future user gesture. No UI is created here.
         */
        async function requestPermission(mode = WORKSPACE_PERMISSION_MODE) {
            if (!directoryHandle || typeof directoryHandle.requestPermission !== 'function') return 'denied';
            try {
                return await directoryHandle.requestPermission({ mode });
            } catch (err) {
                WorkspaceDiagnostics.warn('Workspace requestPermission failed.', err);
                return 'denied';
            }
        }

        /**
         * Return the PA workspace directory handle.
         *
         * The MVP creates only the `PA` folder under the selected Workspace
         * directory when a manual Save Now action needs it.
         */
        async function getWorkspaceDirectory(options = {}) {
            if (!directoryHandle) {
                throw createWorkspaceError('Workspace directory handle is not connected.', 'WORKSPACE_HANDLE_MISSING');
            }
            return directoryHandle.getDirectoryHandle(WORKSPACE_FOLDER_NAME, { create: !!options.create });
        }

        /**
         * Return a FileSystemFileHandle for `PA/workspace.json`.
         */
        async function getWorkspaceFile(fileName = WORKSPACE_FILE_NAME, options = {}) {
            const workspaceDir = await getWorkspaceDirectory({ create: !!options.create });
            return workspaceDir.getFileHandle(fileName, { create: !!options.create });
        }

        /**
         * Return the Workspace backup directory handle: `PA/backups`.
         */
        async function getWorkspaceBackupDirectory(options = {}) {
            const workspaceDir = await getWorkspaceDirectory({ create: !!options.create });
            return workspaceDir.getDirectoryHandle(WORKSPACE_BACKUP_FOLDER_NAME, { create: !!options.create });
        }

        /**
         * Read an existing workspace file.
         *
         * Foundation rule: this method has no PA data integration and no import
         * behavior. Future phases may use it for explicit restore/import flows.
         */
        async function read(fileName = WORKSPACE_FILE_NAME) {
            const fileHandle = await getWorkspaceFile(fileName);
            const file = await fileHandle.getFile();
            return file.text();
        }

        /**
         * Write content to `PA/workspace.json` inside the selected Workspace folder.
         *
         * This is manual-save only. It is not autosave, does not create snapshots,
         * and does not modify existing PA storage/import/export behavior.
         */
        async function write(content, fileName = WORKSPACE_FILE_NAME) {
            if (!directoryHandle) {
                throw createWorkspaceError('Workspace directory handle is not connected.', 'WORKSPACE_HANDLE_MISSING');
            }
            const fileHandle = await getWorkspaceFile(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            try {
                await writable.write(content);
            } finally {
                await writable.close();
            }
            return {
                folder: WORKSPACE_FOLDER_NAME,
                fileName,
                path: `${WORKSPACE_FOLDER_NAME}/${fileName}`,
                savedAt: new Date().toISOString()
            };
        }

        /**
         * Write a rotating automatic snapshot to `PA/backups`.
         */
        async function writeSnapshot(content) {
            if (!directoryHandle) {
                throw createWorkspaceError('Workspace directory handle is not connected.', 'WORKSPACE_HANDLE_MISSING');
            }
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `${WORKSPACE_SNAPSHOT_PREFIX}${timestamp}${WORKSPACE_SNAPSHOT_SUFFIX}`;
            const backupDir = await getWorkspaceBackupDirectory({ create: true });

            const fileHandle = await backupDir.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            try {
                await writable.write(content);
            } finally {
                await writable.close();
            }
            return {
                folder: `${WORKSPACE_FOLDER_NAME}/${WORKSPACE_BACKUP_FOLDER_NAME}`,
                fileName,
                path: `${WORKSPACE_FOLDER_NAME}/${WORKSPACE_BACKUP_FOLDER_NAME}/${fileName}`,
                savedAt: new Date().toISOString()
            };
        }

        /**
         * List Workspace snapshot files sorted by file name ascending.
         */
        async function listSnapshots() {
            try {
                const backupDir = await getWorkspaceBackupDirectory({ create: false });
                if (typeof backupDir.values !== 'function') return [];
                const snapshots = [];
                for await (const entry of backupDir.values()) {
                    if (entry?.kind === 'file'
                        && typeof entry.name === 'string'
                        && entry.name.startsWith(WORKSPACE_SNAPSHOT_PREFIX)
                        && entry.name.endsWith(WORKSPACE_SNAPSHOT_SUFFIX)) {
                        snapshots.push({ name: entry.name, handle: entry });
                    }
                }
                snapshots.sort((a, b) => a.name.localeCompare(b.name));
                return snapshots;
            } catch {
                return [];
            }
        }

        /**
         * Keep only the newest Workspace snapshots and delete older files.
         */
        async function pruneSnapshots(maxCount = WORKSPACE_MAX_SNAPSHOTS) {
            const snapshots = await listSnapshots();
            const excess = Math.max(0, snapshots.length - maxCount);
            if (!excess) return { deleted: 0, remaining: snapshots.length };
            const backupDir = await getWorkspaceBackupDirectory({ create: false });
            const oldSnapshots = snapshots.slice(0, excess);
            let deleted = 0;
            for (const snapshot of oldSnapshots) {
                try {
                    await backupDir.removeEntry(snapshot.name);
                    deleted++;
                } catch (err) {
                    WorkspaceDiagnostics.warn('Failed to prune old Workspace snapshot.', { fileName: snapshot.name, error: err });
                }
            }
            return { deleted, remaining: snapshots.length - deleted };
        }

        /**
         * Delete previously-created empty/invalid automatic snapshots.
         */
        async function pruneEmptySnapshots() {
            const snapshots = await listSnapshots();
            if (!snapshots.length) return { deleted: 0 };
            const backupDir = await getWorkspaceBackupDirectory({ create: false });
            let deleted = 0;
            for (const snapshot of snapshots) {
                try {
                    const file = await snapshot.handle.getFile();
                    const text = await file.text();
                    const data = JSON.parse(text || '{}');
                    if (!hasBackupUserData(data)) {
                        await backupDir.removeEntry(snapshot.name);
                        deleted++;
                    }
                } catch (err) {
                    WorkspaceDiagnostics.warn('Failed to inspect Workspace snapshot.', { fileName: snapshot.name, error: err });
                }
            }
            return { deleted };
        }

        /**
         * Check whether `PA/workspace.json` exists without creating it.
         */
        async function exists(fileName = WORKSPACE_FILE_NAME) {
            try {
                await getWorkspaceFile(fileName);
                return true;
            } catch {
                return false;
            }
        }

        return Object.freeze({
            connect,
            restore,
            disconnect,
            queryPermission,
            requestPermission,
            getWorkspaceDirectory,
            getWorkspaceFile,
            getWorkspaceBackupDirectory,
            read,
            write,
            writeSnapshot,
            listSnapshots,
            pruneSnapshots,
            pruneEmptySnapshots,
            exists
        });
    })();

    const WorkspaceService = (() => {
        let state = WorkspaceState.DISCONNECTED;
        let lastError = null;
        let selectedFolder = '';
        let permissionState = 'unknown';
        const initialMetadata = normalizeWorkspaceMetadata(gmGet(STORAGE_KEYS.WORKSPACE_METADATA, {}));
        let lastSaveAt = initialMetadata.lastSaveAt;
        let lastSavePath = initialMetadata.lastSavePath;
        let lastSnapshotAt = initialMetadata.lastSnapshotAt;
        let lastSnapshotPath = initialMetadata.lastSnapshotPath;
        let snapshotCount = initialMetadata.snapshotCount;
        let initialized = false;
        let initializePromise = null;
        let autoSnapshotDirty = false;
        let autoSnapshotTimer = null;
        let autoSnapshotTimeout = null;
        let autoSnapshotDueAt = initialMetadata.snapshotDueAt;
        let autoSnapshotInProgress = false;
        let autoSnapshotTrackingRegistered = false;
        const provider = LocalWorkspaceProvider;
        const listeners = new Map();

        function normalizeWorkspaceMetadata(value) {
            const metadata = value && typeof value === 'object' ? value : {};
            return {
                workspaceId: typeof metadata.workspaceId === 'string' ? metadata.workspaceId : '',
                createdAt: typeof metadata.createdAt === 'string' ? metadata.createdAt : '',
                lastSaveAt: typeof metadata.lastSaveAt === 'string' ? metadata.lastSaveAt : '',
                lastSavePath: typeof metadata.lastSavePath === 'string' ? metadata.lastSavePath : '',
                lastSnapshotAt: typeof metadata.lastSnapshotAt === 'string' ? metadata.lastSnapshotAt : '',
                lastSnapshotPath: typeof metadata.lastSnapshotPath === 'string' ? metadata.lastSnapshotPath : '',
                snapshotCount: Number.isFinite(Number(metadata.snapshotCount)) ? Number(metadata.snapshotCount) : 0,
                snapshotDueAt: typeof metadata.snapshotDueAt === 'string' ? metadata.snapshotDueAt : ''
            };
        }

        function persistWorkspaceMetadata(nextMetadata = {}) {
            const current = normalizeWorkspaceMetadata(gmGet(STORAGE_KEYS.WORKSPACE_METADATA, {}));
            const metadata = normalizeWorkspaceMetadata({
                workspaceId: nextMetadata.workspaceId ?? current.workspaceId,
                createdAt: nextMetadata.createdAt ?? current.createdAt,
                lastSaveAt: nextMetadata.lastSaveAt ?? lastSaveAt,
                lastSavePath: nextMetadata.lastSavePath ?? lastSavePath,
                lastSnapshotAt: nextMetadata.lastSnapshotAt ?? lastSnapshotAt,
                lastSnapshotPath: nextMetadata.lastSnapshotPath ?? lastSnapshotPath,
                snapshotCount: nextMetadata.snapshotCount ?? snapshotCount,
                snapshotDueAt: nextMetadata.snapshotDueAt ?? autoSnapshotDueAt
            });
            lastSaveAt = metadata.lastSaveAt;
            lastSavePath = metadata.lastSavePath;
            lastSnapshotAt = metadata.lastSnapshotAt;
            lastSnapshotPath = metadata.lastSnapshotPath;
            snapshotCount = metadata.snapshotCount;
            autoSnapshotDueAt = metadata.snapshotDueAt;
            gmSet(STORAGE_KEYS.WORKSPACE_METADATA, metadata);
            return metadata;
        }

        function isWorkspaceDataStorageKey(key) {
            return WORKSPACE_DATA_STORAGE_KEYS.includes(key);
        }

        function refreshWorkspaceMetadataFromStorage() {
            const metadata = normalizeWorkspaceMetadata(gmGet(STORAGE_KEYS.WORKSPACE_METADATA, {}));
            lastSaveAt = metadata.lastSaveAt;
            lastSavePath = metadata.lastSavePath;
            lastSnapshotAt = metadata.lastSnapshotAt;
            lastSnapshotPath = metadata.lastSnapshotPath;
            snapshotCount = metadata.snapshotCount;
            autoSnapshotDueAt = metadata.snapshotDueAt;
            emit('workspace:metadata-changed', { metadata });
            return metadata;
        }

        function markAutoSnapshotDirty(key = '') {
            if (!isWorkspaceDataStorageKey(key)) return false;
            autoSnapshotDirty = true;
            scheduleAutoSnapshot();
            emit('workspace:snapshot-dirty', { key });
            return true;
        }

        function clearScheduledAutoSnapshot() {
            if (autoSnapshotTimeout && typeof window !== 'undefined') {
                window.clearTimeout(autoSnapshotTimeout);
            }
            autoSnapshotTimeout = null;
            autoSnapshotDueAt = '';
            persistWorkspaceMetadata({ snapshotDueAt: '' });
        }

        function scheduleAutoSnapshot(delayMs = WORKSPACE_AUTOSAVE_INTERVAL_MS) {
            if (typeof window === 'undefined') return;
            if (autoSnapshotTimeout) return;
            const safeDelay = Math.max(1000, Number(delayMs) || WORKSPACE_AUTOSAVE_INTERVAL_MS);
            autoSnapshotDueAt = new Date(Date.now() + safeDelay).toISOString();
            persistWorkspaceMetadata({ snapshotDueAt: autoSnapshotDueAt });
            autoSnapshotTimeout = window.setTimeout(() => {
                runScheduledAutoSnapshot();
            }, safeDelay);
            emit('workspace:snapshot-scheduled', { dueAt: autoSnapshotDueAt, delayMs: safeDelay });
        }

        function restoreScheduledAutoSnapshot() {
            if (typeof window === 'undefined' || autoSnapshotTimeout || !autoSnapshotDueAt) return false;
            const dueTime = new Date(autoSnapshotDueAt).getTime();
            if (!Number.isFinite(dueTime)) {
                clearScheduledAutoSnapshot();
                return false;
            }
            const remainingMs = Math.max(1000, dueTime - Date.now());
            autoSnapshotTimeout = window.setTimeout(() => {
                runScheduledAutoSnapshot();
            }, remainingMs);
            emit('workspace:snapshot-scheduled', { dueAt: autoSnapshotDueAt, delayMs: remainingMs, restored: true });
            return true;
        }

        function finishScheduledAutoSnapshot(result) {
            if (result?.ok && !result?.skipped && selectedFolder) {
                scheduleAutoSnapshot(WORKSPACE_AUTOSAVE_INTERVAL_MS);
                return;
            }
            if (result?.ok && result?.reason === 'empty-payload' && selectedFolder) {
                scheduleAutoSnapshot(WORKSPACE_AUTOSAVE_INTERVAL_MS);
                return;
            }
            if (!result?.ok && selectedFolder && result?.reason !== 'no-workspace' && result?.reason !== 'unsupported') {
                scheduleAutoSnapshot(WORKSPACE_AUTOSAVE_WATCHDOG_MS);
                return;
            }
            if (!autoSnapshotDirty) return;
            if (result?.ok && result?.skipped && result?.reason !== 'empty-payload') {
                scheduleAutoSnapshot(WORKSPACE_AUTOSAVE_WATCHDOG_MS);
                return;
            }
            if (!result?.ok) {
                scheduleAutoSnapshot(WORKSPACE_AUTOSAVE_WATCHDOG_MS);
            }
        }

        function runScheduledAutoSnapshot() {
            if (autoSnapshotTimeout && typeof window !== 'undefined') {
                window.clearTimeout(autoSnapshotTimeout);
            }
            autoSnapshotTimeout = null;
            runAutoSnapshotIfNeeded({ force: true }).then(finishScheduledAutoSnapshot).catch(err => {
                WorkspaceDiagnostics.warn('Workspace scheduled auto snapshot failed.', err);
                if (autoSnapshotDirty || selectedFolder) scheduleAutoSnapshot(WORKSPACE_AUTOSAVE_WATCHDOG_MS);
            });
        }

        function runAutoSnapshotIfDue() {
            if (!autoSnapshotDueAt) return;
            if (!autoSnapshotDirty && !(selectedFolder && permissionState === 'granted')) return;
            const dueTime = new Date(autoSnapshotDueAt).getTime();
            if (!Number.isFinite(dueTime) || Date.now() < dueTime) return;
            runScheduledAutoSnapshot();
        }

        function registerAutoSnapshotChangeTracking() {
            if (autoSnapshotTrackingRegistered || typeof window === 'undefined') return;
            autoSnapshotTrackingRegistered = true;
            window.addEventListener('pa:storage-changed', (event) => {
                const key = event?.detail?.key || '';
                if (key === STORAGE_KEYS.WORKSPACE_METADATA) refreshWorkspaceMetadataFromStorage();
                markAutoSnapshotDirty(key);
            });
            window.addEventListener('storage', (event) => {
                const key = event?.key || '';
                if (key === STORAGE_KEYS.WORKSPACE_METADATA) refreshWorkspaceMetadataFromStorage();
                markAutoSnapshotDirty(key);
            });
            window.addEventListener('focus', runAutoSnapshotIfDue);
            if (typeof document !== 'undefined') {
                document.addEventListener('visibilitychange', () => {
                    if (!document.hidden) runAutoSnapshotIfDue();
                });
            }
        }

        function startAutoSnapshotTimer() {
            registerAutoSnapshotChangeTracking();
            if (autoSnapshotTimer || typeof window === 'undefined') return;
            autoSnapshotTimer = window.setInterval(() => {
                if ((autoSnapshotDirty || (selectedFolder && permissionState === 'granted')) && !autoSnapshotDueAt) scheduleAutoSnapshot();
                runAutoSnapshotIfDue();
            }, WORKSPACE_AUTOSAVE_WATCHDOG_MS);
        }

        async function runAutoSnapshotIfNeeded(options = {}) {
            const force = !!options.force;
            if ((!autoSnapshotDirty && !force) || autoSnapshotInProgress) return { ok: true, skipped: true, reason: autoSnapshotInProgress ? 'in-progress' : 'not-dirty' };
            if (!isSupported()) return { ok: false, skipped: true, reason: 'unsupported' };
            if (!selectedFolder) return { ok: false, skipped: true, reason: 'no-workspace' };

            autoSnapshotInProgress = true;
            try {
                emit('workspace:snapshot-started', { dueAt: autoSnapshotDueAt, intervalMs: WORKSPACE_AUTOSAVE_INTERVAL_MS });
                const permission = await checkPermission();
                if (permission !== 'granted') {
                    emit('workspace:snapshot-skipped', { reason: 'permission', permission, intervalMs: WORKSPACE_AUTOSAVE_INTERVAL_MS });
                    return { ok: false, skipped: true, reason: 'permission', permission };
                }
                const data = await buildFullBackupData();
                if (!hasBackupUserData(data)) {
                    autoSnapshotDirty = false;
                    clearScheduledAutoSnapshot();
                    emit('workspace:snapshot-skipped', {
                        reason: 'empty-payload',
                        counts: getBackupUserDataCounts(data),
                        intervalMs: WORKSPACE_AUTOSAVE_INTERVAL_MS
                    });
                    return { ok: true, skipped: true, reason: 'empty-payload', state: getState() };
                }
                const emptyCleanup = await provider.pruneEmptySnapshots();
                const jsonText = JSON.stringify(data, null, 2);
                const result = await provider.writeSnapshot(jsonText);
                const retention = await provider.pruneSnapshots(WORKSPACE_MAX_SNAPSHOTS);
                autoSnapshotDirty = false;
                clearScheduledAutoSnapshot();
                persistWorkspaceMetadata({
                    lastSnapshotAt: result.savedAt,
                    lastSnapshotPath: result.path,
                    snapshotCount: retention.remaining
                });
                emit('workspace:snapshot-saved', {
                    ...result,
                    emptyCleanup,
                    retention,
                    maxSnapshots: WORKSPACE_MAX_SNAPSHOTS,
                    intervalMs: WORKSPACE_AUTOSAVE_INTERVAL_MS,
                    schema: data?.schema,
                    schemaVersion: data?.schemaVersion
                });
                return { ok: true, ...result, emptyCleanup, retention, state: getState() };
            } catch (err) {
                WorkspaceDiagnostics.warn('runAutoSnapshotIfNeeded() failed.', err);
                emit('workspace:snapshot-error', { error: serializeWorkspaceError(err) });
                return { ok: false, error: serializeWorkspaceError(err), state: getState() };
            } finally {
                autoSnapshotInProgress = false;
            }
        }

        async function refreshStatus() {
            try {
                lastError = null;
                if (!isSupported()) {
                    setState(WorkspaceState.DISCONNECTED, { supported: false });
                    return { ok: false, reason: 'unsupported', state: getState() };
                }

                await restore();
                if (!selectedFolder) {
                    return { ok: true, connected: false, permission: permissionState, snapshots: snapshotCount, state: getState() };
                }

                const permission = await checkPermission();
                let snapshots = snapshotCount;
                let emptyCleanup = { deleted: 0 };

                if (permission === 'granted') {
                    emptyCleanup = await provider.pruneEmptySnapshots();
                    const snapshotFiles = await provider.listSnapshots();
                    snapshots = snapshotFiles.length;
                    const latest = snapshotFiles[snapshotFiles.length - 1] || null;
                    if (latest) {
                        let latestAt = lastSnapshotAt;
                        try {
                            const file = await latest.handle.getFile();
                            latestAt = file?.lastModified ? new Date(file.lastModified).toISOString() : latestAt;
                        } catch { }
                        persistWorkspaceMetadata({
                            lastSnapshotAt: latestAt || lastSnapshotAt,
                            lastSnapshotPath: `${WORKSPACE_FOLDER_NAME}/${WORKSPACE_BACKUP_FOLDER_NAME}/${latest.name}`,
                            snapshotCount: snapshots
                        });
                    } else {
                        persistWorkspaceMetadata({
                            lastSnapshotAt: '',
                            lastSnapshotPath: '',
                            snapshotCount: 0
                        });
                    }
                }

                emit('workspace:status-refreshed', { permission, snapshots, emptyCleanup });
                return { ok: true, connected: true, permission, snapshots, emptyCleanup, state: getState() };
            } catch (err) {
                WorkspaceDiagnostics.error('refreshStatus() failed.', err);
                setError(err);
                return { ok: false, error: serializeWorkspaceError(err), state: getState() };
            }
        }

        function setState(nextState, details = {}) {
            const previousState = state;
            state = nextState;
            if (previousState !== nextState) {
                emit('workspace:state-changed', { previousState, state: nextState, details });
            }
            return state;
        }

        function setError(err) {
            lastError = err || null;
            setState(WorkspaceState.ERROR, { error: serializeWorkspaceError(err) });
            emit('workspace:error', { error: serializeWorkspaceError(err) });
        }

        function serializeWorkspaceError(err) {
            if (!err) return null;
            return {
                name: err.name || 'Error',
                message: err.message || String(err),
                code: err.code || 'WORKSPACE_ERROR'
            };
        }

        /**
         * Initialize Workspace foundation state.
         *
         * This method only performs capability detection, DirectoryHandle
         * restoration from IndexedDB, queryPermission(), and timer setup for
         * explicit rotating snapshots. It does not call requestPermission(),
         * overwrite workspace.json automatically, or enable cloud sync.
         */
        async function initialize() {
            if (initializePromise) return initializePromise;
            if (initialized) return getState();
            WorkspaceDiagnostics.debug('initialize() called.');
            startAutoSnapshotTimer();
            initializePromise = (async () => {
                try {
                    if (!isSupported()) {
                        setState(WorkspaceState.DISCONNECTED, { supported: false });
                        initialized = true;
                        return getState();
                    }
                    const restoredState = await restore();
                    initialized = true;
                    return restoredState;
                } finally {
                    initializePromise = null;
                }
            })();
            return initializePromise;
        }

        /**
         * Connect to a local workspace directory through the provider.
         *
         * This requires a future user gesture. It persists only DirectoryHandle
         * in IndexedDB and does not create workspace files.
         */
        async function connect() {
            try {
                lastError = null;
                initialized = true;
                startAutoSnapshotTimer();
                setState(WorkspaceState.CONNECTING);
                const handle = await provider.connect();
                selectedFolder = String(handle?.name || 'Workspace');
                await saveHandle(handle);
                setState(WorkspaceState.CONNECTED);
                let permission = await checkPermission();
                if (permission !== 'granted') {
                    permission = await requestPermission();
                }
                if (permission === 'granted') {
                    autoSnapshotDirty = true;
                    scheduleAutoSnapshot();
                    emit('workspace:snapshot-dirty', { key: 'workspace-connect' });
                }
                return { handle, permission, state };
            } catch (err) {
                WorkspaceDiagnostics.error('connect() failed.', err);
                setError(err);
                return { handle: null, permission: 'denied', state, error: serializeWorkspaceError(err) };
            }
        }

        /**
         * Disconnect Workspace for the current runtime session.
         *
         * By default this clears the persisted DirectoryHandle. Pass
         * `{ clearPersistedHandle: false }` only for a runtime-only disconnect.
         */
        async function disconnect(options = {}) {
            try {
                await provider.disconnect();
                initialized = true;
                autoSnapshotDirty = false;
                clearScheduledAutoSnapshot();
                if (options.clearPersistedHandle !== false) {
                    await clearHandle();
                }
                selectedFolder = '';
                permissionState = 'unknown';
                setState(WorkspaceState.DISCONNECTED);
                emit('workspace:disconnected', { clearPersistedHandle: options.clearPersistedHandle !== false });
                return getState();
            } catch (err) {
                WorkspaceDiagnostics.error('disconnect() failed.', err);
                setError(err);
                return getState();
            }
        }

        /**
         * Restore a persisted DirectoryHandle from IndexedDB and check current
         * permission without requesting permission and without reading/writing files.
         */
        async function restore() {
            try {
                lastError = null;
                if (!isSupported()) {
                    setState(WorkspaceState.DISCONNECTED, { supported: false });
                    return getState();
                }
                setState(WorkspaceState.CONNECTING);
                const handle = await restoreHandle();
                if (!handle) {
                    selectedFolder = '';
                    setState(WorkspaceState.DISCONNECTED, { restored: false });
                    return getState();
                }
                selectedFolder = String(handle?.name || 'Workspace');
                setState(WorkspaceState.CONNECTED, { restored: true });
                const permission = await checkPermission();
                if (permission === 'granted' && !restoreScheduledAutoSnapshot()) scheduleAutoSnapshot();
                return getState();
            } catch (err) {
                WorkspaceDiagnostics.error('restore() failed.', err);
                setError(err);
                return getState();
            }
        }

        /**
         * Return the current Workspace state snapshot.
         */
        function getState() {
            return Object.freeze({
                state,
                supported: isSupported(),
                provider: WORKSPACE_PROVIDER_LOCAL,
                selectedFolder,
                permission: permissionState,
                lastSaveAt,
                lastSavePath,
                lastSnapshotAt,
                lastSnapshotPath,
                snapshotCount,
                snapshotDirty: autoSnapshotDirty,
                snapshotDueAt: autoSnapshotDueAt,
                snapshotInProgress: autoSnapshotInProgress,
                snapshotIntervalMs: WORKSPACE_AUTOSAVE_INTERVAL_MS,
                maxSnapshots: WORKSPACE_MAX_SNAPSHOTS,
                error: serializeWorkspaceError(lastError)
            });
        }

        /**
         * Return the active Workspace provider abstraction.
         */
        function getProvider() {
            return provider;
        }

        /**
         * Return whether Local Workspace is supported in this browser/runtime.
         *
         * Chromium with File System Access API and IndexedDB returns true.
         * Firefox returns unsupported. No polyfills are used.
         */
        function isSupported() {
            const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
            if (/Firefox|FxiOS/i.test(ua)) return false;
            return typeof window !== 'undefined'
                && typeof window.showDirectoryPicker === 'function'
                && typeof indexedDB !== 'undefined';
        }

        /**
         * Request read/write permission for the restored/connected workspace.
         *
         * This does not create UI. A future UI caller must call it from a user
         * gesture when the browser requires one.
         */
        async function requestPermission() {
            try {
                const permission = await provider.requestPermission(WORKSPACE_PERMISSION_MODE);
                permissionState = permission || 'unknown';
                if (permission === 'granted') {
                    setState(WorkspaceState.READY, { permission });
                } else {
                    setState(WorkspaceState.PERMISSION_REQUIRED, { permission });
                }
                emit('workspace:permission-changed', { permission });
                return permission;
            } catch (err) {
                WorkspaceDiagnostics.error('requestPermission() failed.', err);
                setError(err);
                return 'denied';
            }
        }

        /**
         * Check read/write permission for the restored/connected workspace.
         *
         * This never prompts. It uses queryPermission only.
         */
        async function checkPermission() {
            try {
                const permission = await provider.queryPermission(WORKSPACE_PERMISSION_MODE);
                permissionState = permission || 'unknown';
                if (permission === 'granted') {
                    setState(WorkspaceState.READY, { permission });
                } else {
                    setState(WorkspaceState.PERMISSION_REQUIRED, { permission });
                }
                emit('workspace:permission-checked', { permission });
                return permission;
            } catch (err) {
                WorkspaceDiagnostics.error('checkPermission() failed.', err);
                setError(err);
                return 'denied';
            }
        }

        /**
         * Persist only the DirectoryHandle in IndexedDB.
         *
         * This does not write PA feature data, backup data, or workspace files.
         */
        async function saveHandle(directoryHandle) {
            if (!directoryHandle) {
                throw createWorkspaceError('Cannot save an empty Workspace handle.', 'WORKSPACE_HANDLE_MISSING');
            }
            selectedFolder = String(directoryHandle?.name || selectedFolder || 'Workspace');
            await putWorkspaceHandleRecord(directoryHandle);
            emit('workspace:handle-saved', { provider: WORKSPACE_PROVIDER_LOCAL });
            return true;
        }

        /**
         * Restore only the DirectoryHandle from IndexedDB.
         *
         * This does not request permission and does not read or write files.
         */
        async function restoreHandle() {
            const handle = await provider.restore();
            selectedFolder = handle ? String(handle?.name || 'Workspace') : '';
            emit('workspace:handle-restored', { restored: !!handle, provider: WORKSPACE_PROVIDER_LOCAL });
            return handle;
        }

        /**
         * Clear the persisted DirectoryHandle from IndexedDB.
         *
         * This does not delete any user files or PA feature data.
         */
        async function clearHandle() {
            await deleteWorkspaceHandleRecord();
            selectedFolder = '';
            permissionState = 'unknown';
            emit('workspace:handle-cleared', { provider: WORKSPACE_PROVIDER_LOCAL });
            return true;
        }

        /**
         * Manually save the existing PA backup payload to `PA/workspace.json`.
         *
         * This uses the existing `buildFullBackupData()` serialization and does
         * not invent a new schema. It is manual only: automatic snapshots use
         * separate files under `PA/backups` and never overwrite this file.
         */
        async function saveNow() {
            try {
                lastError = null;
                if (!isSupported()) {
                    throw createWorkspaceError('Workspace is unsupported in this browser.', 'WORKSPACE_UNSUPPORTED');
                }
                let permission = await checkPermission();
                if (permission !== 'granted') {
                    permission = await requestPermission();
                }
                if (permission !== 'granted') {
                    throw createWorkspaceError('Workspace permission is required before saving.', 'WORKSPACE_PERMISSION_REQUIRED');
                }
                const data = await buildFullBackupData();
                const jsonText = JSON.stringify(data, null, 2);
                const result = await provider.write(jsonText, WORKSPACE_FILE_NAME);
                persistWorkspaceMetadata({
                    lastSaveAt: result.savedAt,
                    lastSavePath: result.path
                });
                emit('workspace:saved', { ...result, schema: data?.schema, schemaVersion: data?.schemaVersion });
                return { ok: true, ...result, state: getState() };
            } catch (err) {
                WorkspaceDiagnostics.error('saveNow() failed.', err);
                setError(err);
                return { ok: false, error: serializeWorkspaceError(err), state: getState() };
            }
        }

        /**
         * Manually restore/import PA data from `PA/workspace.json`.
         *
         * This reads the existing backup-compatible workspace file and delegates
         * to `importBackupData()` so current import normalization and merge
         * behavior remain unchanged. It does not implement autosave, snapshots,
         * conflict detection, cloud sync, version history, or background sync.
         */
        async function restoreNow() {
            try {
                lastError = null;
                if (!isSupported()) {
                    throw createWorkspaceError('Workspace is unsupported in this browser.', 'WORKSPACE_UNSUPPORTED');
                }
                let permission = await checkPermission();
                if (permission !== 'granted') {
                    permission = await requestPermission();
                }
                if (permission !== 'granted') {
                    throw createWorkspaceError('Workspace permission is required before restoring.', 'WORKSPACE_PERMISSION_REQUIRED');
                }
                const text = await provider.read(WORKSPACE_FILE_NAME);
                let data;
                try {
                    data = JSON.parse(text);
                } catch (err) {
                    throw createWorkspaceError('Workspace file is not a valid PA file.', 'WORKSPACE_INVALID_PA', err);
                }
                await importBackupData(data);
                const restoredAt = new Date().toISOString();
                emit('workspace:restored', {
                    folder: WORKSPACE_FOLDER_NAME,
                    fileName: WORKSPACE_FILE_NAME,
                    path: `${WORKSPACE_FOLDER_NAME}/${WORKSPACE_FILE_NAME}`,
                    restoredAt,
                    schema: data?.schema,
                    schemaVersion: data?.schemaVersion
                });
                return {
                    ok: true,
                    path: `${WORKSPACE_FOLDER_NAME}/${WORKSPACE_FILE_NAME}`,
                    restoredAt,
                    state: getState()
                };
            } catch (err) {
                WorkspaceDiagnostics.error('restoreNow() failed.', err);
                setError(err);
                return { ok: false, error: serializeWorkspaceError(err), state: getState() };
            }
        }

        /**
         * Dispatch an internal Workspace event.
         *
         * No UI listeners or feature listeners are registered in this patch.
         */
        function emit(eventName, payload = {}) {
            const event = Object.freeze({
                type: eventName,
                timestamp: new Date().toISOString(),
                payload
            });
            const directListeners = listeners.get(eventName) || new Set();
            const wildcardListeners = listeners.get('*') || new Set();
            [...directListeners, ...wildcardListeners].forEach((handler) => {
                try {
                    handler(event);
                } catch (err) {
                    WorkspaceDiagnostics.warn(`Workspace event listener failed for ${eventName}.`, err);
                }
            });
            return event;
        }

        /**
         * Register an internal Workspace event listener.
         *
         * Returns an unsubscribe function. No listeners are registered by
         * default in this patch.
         */
        function on(eventName, handler) {
            if (!eventName || typeof handler !== 'function') return () => { };
            if (!listeners.has(eventName)) listeners.set(eventName, new Set());
            listeners.get(eventName).add(handler);
            return () => off(eventName, handler);
        }

        /**
         * Remove an internal Workspace event listener.
         */
        function off(eventName, handler) {
            const set = listeners.get(eventName);
            if (!set) return false;
            const removed = set.delete(handler);
            if (set.size === 0) listeners.delete(eventName);
            return removed;
        }

        return Object.freeze({
            initialize,
            connect,
            disconnect,
            restore,
            getState,
            getProvider,
            isSupported,
            requestPermission,
            checkPermission,
            refreshStatus,
            saveHandle,
            restoreHandle,
            clearHandle,
            saveNow,
            restoreNow,
            emit,
            on,
            off
        });
    })();

    const CLIPBOARD_CACHE_KEY = STORAGE_KEYS.CLIPBOARD_CACHE;
    let clipboardCache = gmGet(CLIPBOARD_CACHE_KEY, '');

    let switchTab = () => { };
    let registerTab = () => { };
    let updateTaskTabBadge = () => { };
    let barcodesCache = null;
    let foldersCache = null;
    let barcodesCacheDirty = true;
    let foldersCacheDirty = true;
    const qrPreviewCache = new Map();
    const QR_PREVIEW_CACHE_KEY = STORAGE_KEYS.QR_PREVIEW_CACHE;
    const QR_PREVIEW_CACHE_MAX = 120;
    const QR_PREVIEW_DEFAULT_SIZE = 110;
    const QR_PREFETCH_LAST_RUN_KEY = STORAGE_KEYS.QR_PREFETCH_LAST_RUN;
    const QR_PREFETCH_MIN_INTERVAL_MS = 72 * 60 * 60 * 1000;
    let qrPreviewCacheOrder = [];
    let qrPreviewCacheSaveTimer = null;
    const qrPreviewPrefetchQueue = [];
    const qrPreviewPrefetchQueuedKeys = new Set();
    let qrPreviewPrefetchRunning = false;
    let qrPreviewPrefetchDebounce = null;

    function getQrPreviewCacheKey(value, size) {
        return `${size}::${String(value ?? '')}`;
    }

    function loadQrPreviewCache() {
        try {
            const raw = localStorage.getItem(QR_PREVIEW_CACHE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            const entries = Array.isArray(data?.entries) ? data.entries : [];
            qrPreviewCache.clear();
            qrPreviewCacheOrder = [];
            entries.forEach((pair) => {
                if (!Array.isArray(pair) || pair.length < 2) return;
                const [key, url] = pair;
                if (!key || !url) return;
                qrPreviewCache.set(key, url);
                qrPreviewCacheOrder.push(key);
            });
        } catch { }
    }

    function queueSaveQrPreviewCache() {
        if (qrPreviewCacheSaveTimer) return;
        qrPreviewCacheSaveTimer = setTimeout(() => {
            qrPreviewCacheSaveTimer = null;
            try {
                const entries = qrPreviewCacheOrder
                    .map((key) => [key, qrPreviewCache.get(key)])
                    .filter((pair) => pair[0] && pair[1]);
                localStorage.setItem(QR_PREVIEW_CACHE_KEY, JSON.stringify({ entries }));
            } catch { }
        }, 300);
    }

    function touchQrPreviewCacheKey(key) {
        const idx = qrPreviewCacheOrder.indexOf(key);
        if (idx >= 0) qrPreviewCacheOrder.splice(idx, 1);
        qrPreviewCacheOrder.push(key);
    }

    function setQrPreviewCacheEntry(key, url) {
        if (!key || !url) return;
        qrPreviewCache.set(key, url);
        touchQrPreviewCacheKey(key);
        while (qrPreviewCacheOrder.length > QR_PREVIEW_CACHE_MAX) {
            const oldest = qrPreviewCacheOrder.shift();
            if (oldest) qrPreviewCache.delete(oldest);
        }
        queueSaveQrPreviewCache();
    }

    function scheduleIdle(fn) {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => fn());
            return;
        }
        setTimeout(fn, 0);
    }

    function getQrPrefetchLastRun() {
        try {
            const raw = localStorage.getItem(QR_PREFETCH_LAST_RUN_KEY);
            const ts = raw ? parseInt(raw, 10) : 0;
            return Number.isFinite(ts) ? ts : 0;
        } catch {
            return 0;
        }
    }

    function setQrPrefetchLastRun(ts = Date.now()) {
        try {
            localStorage.setItem(QR_PREFETCH_LAST_RUN_KEY, String(ts));
        } catch { }
    }

    function startQrPreviewPrefetchWorker() {
        if (qrPreviewPrefetchRunning) return;
        qrPreviewPrefetchRunning = true;

        const processNext = () => {
            if (!qrPreviewPrefetchQueue.length) {
                qrPreviewPrefetchRunning = false;
                return;
            }
            const item = qrPreviewPrefetchQueue.shift();
            if (!item) {
                qrPreviewPrefetchRunning = false;
                return;
            }
            qrPreviewPrefetchQueuedKeys.delete(item.key);

            if (qrPreviewCache.has(item.key)) {
                scheduleIdle(processNext);
                return;
            }
            if (typeof QRCode === 'undefined') {
                scheduleIdle(processNext);
                return;
            }

            try {
                if (QRCode.toDataURL) {
                    QRCode.toDataURL(item.value, { margin: 0, width: item.size }, function (err, url) {
                        if (!err && url) {
                            setQrPreviewCacheEntry(item.key, url);
                        }
                        scheduleIdle(processNext);
                    });
                    return;
                }
                if (QRCode.toCanvas) {
                    const canvas = document.createElement('canvas');
                    QRCode.toCanvas(canvas, item.value, { margin: 0, width: item.size }, function () {
                        try {
                            const url = canvas.toDataURL('image/png');
                            if (url) {
                                setQrPreviewCacheEntry(item.key, url);
                            }
                        } catch { }
                        scheduleIdle(processNext);
                    });
                    return;
                }
            } catch { }

            scheduleIdle(processNext);
        };

        scheduleIdle(processNext);
    }

    function enqueueQrPreviewPrefetch(barcodes, size = QR_PREVIEW_DEFAULT_SIZE) {
        if (!Array.isArray(barcodes) || !barcodes.length) return 0;
        const nextItems = [];
        for (const b of barcodes) {
            const fmt = String(b?.format || '').toUpperCase();
            if (fmt !== 'QR' && fmt !== '2D') continue;
            const valueStr = String(b?.value || '').trim();
            if (!valueStr) continue;
            const key = getQrPreviewCacheKey(valueStr, size);
            if (qrPreviewCache.has(key) || qrPreviewPrefetchQueuedKeys.has(key)) continue;
            qrPreviewPrefetchQueuedKeys.add(key);
            nextItems.push({ key, value: valueStr, size });
        }
        if (!nextItems.length) return 0;
        qrPreviewPrefetchQueue.push(...nextItems);
        startQrPreviewPrefetchWorker();
        return nextItems.length;
    }

    function scheduleQrPreviewPrefetch() {
        if (!panel || panel.style.display === 'none') return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        const lastRun = getQrPrefetchLastRun();
        if (lastRun && (Date.now() - lastRun) < QR_PREFETCH_MIN_INTERVAL_MS) return;
        if (qrPreviewPrefetchDebounce) {
            clearTimeout(qrPreviewPrefetchDebounce);
        }
        qrPreviewPrefetchDebounce = setTimeout(async () => {
            qrPreviewPrefetchDebounce = null;
            const barcodes = await getBarcodes();
            const added = enqueueQrPreviewPrefetch(barcodes, QR_PREVIEW_DEFAULT_SIZE);
            if (added > 0) {
                setQrPrefetchLastRun();
            }
        }, 600);
    }

    function setBarcodesCache(list) {
        StorageService.setBarcodesCache(list);
    }

    function setFoldersCache(list) {
        StorageService.setFoldersCache(list);
    }

    function invalidateBarcodesCache() {
        StorageService.invalidateBarcodesCache();
    }

    function invalidateFoldersCache() {
        StorageService.invalidateFoldersCache();
    }

    StorageService.registerCacheInvalidationListeners();

    loadQrPreviewCache();

    function cacheClipboardValue(value) {
        const safeValue = String(value ?? '');
        clipboardCache = safeValue;
        gmSet(CLIPBOARD_CACHE_KEY, safeValue);
    }

    function getCachedClipboardValue() {
        const cached = clipboardCache || gmGet(CLIPBOARD_CACHE_KEY, '');
        return String(cached || '').trim();
    }

    // ============================================================
    // SECTION: Folder Data Operations
    // ------------------------------------------------------------
    // Pure data operations for folders plus small UI callbacks that
    // refresh the current panel after folder changes.
    // ============================================================

    // --- Folder Data Service ---
    const FolderDataService = (() => {
        async function getFolders() {
            if (!foldersCacheDirty && Array.isArray(foldersCache)) return foldersCache;
            const folders = StorageService.gmGet(STORAGE_KEYS.FOLDERS, []);
            setFoldersCache(folders);
            return foldersCache;
        }

        function getSelectedFolderValue(select, fallback = 'Default') {
            const val = select?.value;
            if (val && val !== '__NEW__') return val;
            const last = select?.dataset?.lastValid;
            return last || fallback;
        }

        function parseTreeSelectValue(val, fallbackFolder = 'Default') {
            if (!val || val === '__NEW__') return { folder: fallbackFolder, subfolder: '' };
            const idx = val.indexOf('::');
            if (idx === -1) return { folder: val || fallbackFolder, subfolder: '' };
            return { folder: val.slice(0, idx) || fallbackFolder, subfolder: val.slice(idx + 2) };
        }

        function normalizeFolderDestination(preferredFolder = 'Default', preferredSubFolder = '') {
            return {
                folder: preferredFolder || activeFolder || 'Default',
                subfolder: preferredSubFolder || ''
            };
        }

        function getSelectedFolderDestination(select, fallbackFolder = 'Default') {
            const raw = (select?.value && select.value !== '__NEW__')
                ? select.value
                : (select?.dataset?.lastValid || `${fallbackFolder}::`);
            return parseTreeSelectValue(raw, fallbackFolder);
        }

        async function saveFolder(name, options = {}) {
            let folders = await getFolders();
            const exists = folders.some(f => f.name.toLowerCase() === name.toLowerCase());
            if (exists) {
                showFlash(`Folder already exists: ${name}`, true, 'error');
                return false;
            }
            folders.push({ name, pinned: false });
            StorageService.gmSet(STORAGE_KEYS.FOLDERS, folders);
            setFoldersCache(folders);
            if (options.render !== false) {
                formWrapper.innerHTML = '';
                renderFolders();
            }
            showFlash(`Folder created: ${name}`, false, 'success');
            return true;
        }

        async function updateFolder(name, updates) {
            let folders = await getFolders();
            folders = folders.map(f => f.name === name ? { ...f, ...updates } : f);
            StorageService.gmSet(STORAGE_KEYS.FOLDERS, folders);
            setFoldersCache(folders);
            renderFolders();
        }

        async function deleteFolder(folderName) {
            let folders = await getFolders();
            folders = folders.filter(f => f.name !== folderName);
            StorageService.gmSet(STORAGE_KEYS.FOLDERS, folders);
            setFoldersCache(folders);
            // Delete all sub-folders belonging to this folder
            let subFolders = getAllSubFolders();
            subFolders = subFolders.filter(sf => sf.parent !== folderName);
            StorageService.gmSet(STORAGE_KEYS.SUBFOLDERS, subFolders);
            let barcodes = await getBarcodes();
            barcodes = barcodes.filter(b => (b.folder || '').toLowerCase() !== folderName.toLowerCase());
            StorageService.gmSet(STORAGE_KEYS.BARCODES, barcodes);
            setBarcodesCache(barcodes);
            if (activeFolder === folderName) { activeFolder = null; activeSubFolder = null; }
            renderFolders();
            showFlash(`Folder deleted`, false, 'success');
        }

        async function renameFolder(oldName, newName) {
            let folders = await getFolders();
            if (folders.some(f => f.name.toLowerCase() === newName.toLowerCase())) {
                showFlash('Folder name already exists', true, 'error');
                return;
            }
            folders = folders.map(f => f.name === oldName ? { ...f, name: newName } : f);
            StorageService.gmSet(STORAGE_KEYS.FOLDERS, folders);
            setFoldersCache(folders);
            // Update sub-folder parent references
            let subFolders = getAllSubFolders();
            subFolders = subFolders.map(sf => sf.parent === oldName ? { ...sf, parent: newName } : sf);
            StorageService.gmSet(STORAGE_KEYS.SUBFOLDERS, subFolders);
            // Update barcodes folder name
            let barcodes = await getBarcodes();
            barcodes = barcodes.map(b => (b.folder || '') === oldName ? { ...b, folder: newName } : b);
            StorageService.gmSet(STORAGE_KEYS.BARCODES, barcodes);
            setBarcodesCache(barcodes);
            if (activeFolder === oldName) activeFolder = newName;
            renderFolders();
            showFlash(`Folder renamed to ${newName}`, false, 'success');
        }

        function getAllSubFolders() {
            return StorageService.gmGet(STORAGE_KEYS.SUBFOLDERS, []);
        }

        function getSubFolders(parentName) {
            return getAllSubFolders().filter(sf => sf.parent === parentName);
        }

        async function saveSubFolder(parentName, subName) {
            const trimmed = String(subName || '').trim();
            if (!trimmed) { showFlash('Name cannot be empty', true, 'error'); return; }
            const all = getAllSubFolders();
            if (all.some(sf => sf.parent === parentName && sf.name.toLowerCase() === trimmed.toLowerCase())) {
                showFlash('Sub-folder already exists', true, 'error');
                return;
            }
            all.push({ name: trimmed, parent: parentName, pinned: false });
            StorageService.gmSet(STORAGE_KEYS.SUBFOLDERS, all);
            renderFolders();
            showFlash(`Sub-folder created: ${trimmed}`, false, 'success');
        }

        async function deleteSubFolder(parentName, subName) {
            let all = getAllSubFolders();
            all = all.filter(sf => !(sf.parent === parentName && sf.name === subName));
            StorageService.gmSet(STORAGE_KEYS.SUBFOLDERS, all);
            let barcodes = await getBarcodes();
            barcodes = barcodes.filter(b => !(
                (b.folder || '').toLowerCase() === parentName.toLowerCase() &&
                (b.subfolder || '').toLowerCase() === subName.toLowerCase()
            ));
            StorageService.gmSet(STORAGE_KEYS.BARCODES, barcodes);
            setBarcodesCache(barcodes);
            if (activeSubFolder === subName && activeFolder === parentName) activeSubFolder = null;
            renderFolders();
            showFlash('Sub-folder deleted', false, 'success');
        }

        async function renameSubFolder(parentName, oldName, newName) {
            const trimmed = String(newName || '').trim();
            if (!trimmed) { showFlash('Name cannot be empty', true, 'error'); return; }
            let all = getAllSubFolders();
            if (all.some(sf => sf.parent === parentName && sf.name.toLowerCase() === trimmed.toLowerCase())) {
                showFlash('Sub-folder name already exists', true, 'error');
                return;
            }
            all = all.map(sf => sf.parent === parentName && sf.name === oldName ? { ...sf, name: trimmed } : sf);
            StorageService.gmSet(STORAGE_KEYS.SUBFOLDERS, all);
            let barcodes = await getBarcodes();
            barcodes = barcodes.map(b =>
                (b.folder || '') === parentName && (b.subfolder || '') === oldName
                    ? { ...b, subfolder: trimmed } : b
            );
            StorageService.gmSet(STORAGE_KEYS.BARCODES, barcodes);
            setBarcodesCache(barcodes);
            if (activeSubFolder === oldName) activeSubFolder = trimmed;
            renderFolders();
            showFlash(`Renamed to ${trimmed}`, false, 'success');
        }

        async function updateSubFolder(parentName, subName, updates) {
            let all = getAllSubFolders();
            all = all.map(sf => (sf.parent === parentName && sf.name === subName) ? { ...sf, ...updates } : sf);
            StorageService.gmSet(STORAGE_KEYS.SUBFOLDERS, all);
            renderFolders();
        }

        async function moveFolderTo(folderName, destFolder) {
            if (!destFolder) {
                showFlash('Folder is already at Root', false, 'info');
                return;
            }
            if (destFolder === folderName) {
                showFlash('Cannot move a folder into itself', true, 'error');
                return;
            }
            // Single sub-folder level only: a folder with its own sub-folders can't be demoted.
            if (getSubFolders(folderName).length > 0) {
                showFlash('Move or remove its sub-folders first', true, 'error');
                return;
            }
            let folders = await getFolders();
            if (!folders.some(f => f.name === destFolder)) {
                showFlash('Destination folder not found', true, 'error');
                return;
            }
            let subFolders = getAllSubFolders();
            if (!subFolders.some(sf => sf.parent === destFolder && sf.name.toLowerCase() === folderName.toLowerCase())) {
                subFolders.push({ name: folderName, parent: destFolder, pinned: false });
                StorageService.gmSet(STORAGE_KEYS.SUBFOLDERS, subFolders);
            }
            let barcodes = await getBarcodes();
            barcodes = barcodes.map(b =>
                (b.folder || '').toLowerCase() === folderName.toLowerCase()
                    ? { ...b, folder: destFolder, subfolder: folderName }
                    : b
            );
            StorageService.gmSet(STORAGE_KEYS.BARCODES, barcodes);
            setBarcodesCache(barcodes);
            folders = folders.filter(f => f.name !== folderName);
            StorageService.gmSet(STORAGE_KEYS.FOLDERS, folders);
            setFoldersCache(folders);
            if (activeFolder === folderName) { activeFolder = destFolder; activeSubFolder = folderName; }
            renderFolders();
            showFlash(`Moved "${folderName}" into "${destFolder}"`, false, 'success');
        }

        async function moveSubFolderTo(parentName, subName, destFolder) {
            if (destFolder === parentName) {
                showFlash('Sub-folder is already here', false, 'info');
                return;
            }
            let subFolders = getAllSubFolders();
            let folders = await getFolders();
            let barcodes = await getBarcodes();

            if (!destFolder) {
                // Promote to a top-level folder named subName.
                if (!folders.some(f => f.name.toLowerCase() === subName.toLowerCase())) {
                    folders.push({ name: subName, pinned: false });
                    StorageService.gmSet(STORAGE_KEYS.FOLDERS, folders);
                    setFoldersCache(folders);
                }
                barcodes = barcodes.map(b =>
                    (b.folder || '').toLowerCase() === parentName.toLowerCase() &&
                        (b.subfolder || '').toLowerCase() === subName.toLowerCase()
                        ? { ...b, folder: subName, subfolder: '' }
                        : b
                );
                StorageService.gmSet(STORAGE_KEYS.BARCODES, barcodes);
                setBarcodesCache(barcodes);
                subFolders = subFolders.filter(sf => !(sf.parent === parentName && sf.name === subName));
                StorageService.gmSet(STORAGE_KEYS.SUBFOLDERS, subFolders);
                if (activeFolder === parentName && activeSubFolder === subName) { activeFolder = subName; activeSubFolder = null; }
                renderFolders();
                showFlash(`Moved "${subName}" to Root`, false, 'success');
                return;
            }

            // Move into another folder as a sub-folder.
            if (!folders.some(f => f.name === destFolder)) {
                showFlash('Destination folder not found', true, 'error');
                return;
            }
            if (!subFolders.some(sf => sf.parent === destFolder && sf.name.toLowerCase() === subName.toLowerCase())) {
                subFolders.push({ name: subName, parent: destFolder, pinned: false });
            }
            subFolders = subFolders.filter(sf => !(sf.parent === parentName && sf.name === subName));
            StorageService.gmSet(STORAGE_KEYS.SUBFOLDERS, subFolders);
            barcodes = barcodes.map(b =>
                (b.folder || '').toLowerCase() === parentName.toLowerCase() &&
                    (b.subfolder || '').toLowerCase() === subName.toLowerCase()
                    ? { ...b, folder: destFolder, subfolder: subName }
                    : b
            );
            StorageService.gmSet(STORAGE_KEYS.BARCODES, barcodes);
            setBarcodesCache(barcodes);
            if (activeFolder === parentName && activeSubFolder === subName) { activeFolder = destFolder; }
            renderFolders();
            showFlash(`Moved "${subName}" into "${destFolder}"`, false, 'success');
        }

        return Object.freeze({
            getFolders,
            getSelectedFolderValue,
            parseTreeSelectValue,
            normalizeFolderDestination,
            getSelectedFolderDestination,
            saveFolder,
            updateFolder,
            deleteFolder,
            renameFolder,
            getAllSubFolders,
            getSubFolders,
            saveSubFolder,
            deleteSubFolder,
            renameSubFolder,
            updateSubFolder,
            moveFolderTo,
            moveSubFolderTo
        });
    })();

    // --- Folder Data Compatibility Facades ---
    async function getFolders() {
        return FolderDataService.getFolders();
    }

    function getSelectedFolderValue(select, fallback = 'Default') {
        return FolderDataService.getSelectedFolderValue(select, fallback);
    }

    function parseTreeSelectValue(val, fallbackFolder = 'Default') {
        return FolderDataService.parseTreeSelectValue(val, fallbackFolder);
    }

    function normalizeFolderDestination(preferredFolder = 'Default', preferredSubFolder = '') {
        return FolderDataService.normalizeFolderDestination(preferredFolder, preferredSubFolder);
    }

    function getSelectedFolderDestination(select, fallbackFolder = 'Default') {
        return FolderDataService.getSelectedFolderDestination(select, fallbackFolder);
    }

    async function saveFolder(name, options = {}) {
        return FolderDataService.saveFolder(name, options);
    }

    async function updateFolder(name, updates) {
        return FolderDataService.updateFolder(name, updates);
    }

    async function deleteFolder(folderName) {
        return FolderDataService.deleteFolder(folderName);
    }

    async function renameFolder(oldName, newName) {
        return FolderDataService.renameFolder(oldName, newName);
    }

    function getAllSubFolders() {
        return FolderDataService.getAllSubFolders();
    }

    function getSubFolders(parentName) {
        return FolderDataService.getSubFolders(parentName);
    }

    async function saveSubFolder(parentName, subName) {
        return FolderDataService.saveSubFolder(parentName, subName);
    }

    async function deleteSubFolder(parentName, subName) {
        return FolderDataService.deleteSubFolder(parentName, subName);
    }

    async function renameSubFolder(parentName, oldName, newName) {
        return FolderDataService.renameSubFolder(parentName, oldName, newName);
    }

    async function updateSubFolder(parentName, subName, updates) {
        return FolderDataService.updateSubFolder(parentName, subName, updates);
    }

    async function moveFolderTo(folderName, destFolder) {
        return FolderDataService.moveFolderTo(folderName, destFolder);
    }

    async function moveSubFolderTo(parentName, subName, destFolder) {
        return FolderDataService.moveSubFolderTo(parentName, subName, destFolder);
    }

    // --- Folder UI Helpers ---
    async function populateFolderSelect(select, preferred) {
        const folders = await getFolders();
        select.innerHTML = '';
        if (folders.length === 0) {
            await saveFolder('Default');
            select.innerHTML = '<option value="Default">Default</option>';
            const addOpt = document.createElement('option');
            addOpt.value = '__NEW__';
            addOpt.textContent = '➕ New folder...';
            select.appendChild(addOpt);
            select.value = 'Default';
            return;
        }
        folders.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.name;
            opt.textContent = f.name;
            select.appendChild(opt);
        });
        const addOpt = document.createElement('option');
        addOpt.value = '__NEW__';
        addOpt.textContent = '➕ New folder...';
        select.appendChild(addOpt);

        if (preferred && folders.some(f => f.name === preferred)) {
            select.value = preferred;
        } else {
            select.value = folders[0].name;
        }
        select.dataset.lastValid = select.value;
    }

    // Populates a <select> with a flat indented tree: each folder is a selectable
    // option (folder icon), each sub-folder an indented selectable option (sub-folder icon).
    // Value format: "folderName::subFolderName" or "folderName::" (no sub-folder).
    async function populateFolderTreeSelect(treeSelect, preferredFolder, preferredSubFolder) {
        const folders = await getFolders();
        treeSelect.innerHTML = '';
        treeSelect.dataset.noFolders = folders.length === 0 ? '1' : '0';
        if (folders.length === 0) {
            const addOpt = document.createElement('option');
            addOpt.value = '__NEW__';
            addOpt.textContent = '➕ New folder...';
            treeSelect.appendChild(addOpt);
            treeSelect.value = '__NEW__';
            treeSelect.dataset.lastValid = '';
            return;
        }
        folders.forEach(folder => {
            const folderOpt = document.createElement('option');
            folderOpt.value = `${folder.name}::`;
            folderOpt.textContent = `\uD83D\uDCC1 ${folder.name}`;
            treeSelect.appendChild(folderOpt);

            const subs = getSubFolders(folder.name);
            subs.forEach(sf => {
                const opt = document.createElement('option');
                opt.value = `${folder.name}::${sf.name}`;
                opt.textContent = `\u00A0\u00A0\u00A0\u00A0\uD83D\uDCC2 ${sf.name}`;
                treeSelect.appendChild(opt);
            });
        });

        const addOpt = document.createElement('option');
        addOpt.value = '__NEW__';
        addOpt.textContent = '\u2795 New folder...';
        treeSelect.appendChild(addOpt);

        const targetValue = preferredSubFolder
            ? `${preferredFolder}::${preferredSubFolder}`
            : `${preferredFolder}::`;
        const exists = Array.from(treeSelect.options).some(o => o.value === targetValue);
        treeSelect.value = exists ? targetValue : (treeSelect.options[0]?.value || '');
        treeSelect.dataset.lastValid = treeSelect.value;
    }

    function createFolderDestinationSelect(preferredFolder = 'Default', preferredSubFolder = '', styleOverrides = {}) {
        const select = document.createElement('select');
        select.className = 'bm-input';
        Object.assign(select.style, styleOverrides || {});

        const initial = normalizeFolderDestination(preferredFolder, preferredSubFolder);
        populateFolderTreeSelect(select, initial.folder, initial.subfolder);
        const handleNewFolderSelection = () => {
            if (select.value !== '__NEW__') {
                select.dataset.lastValid = select.value;
                return;
            }
            if (select.dataset.pendingNew === '1') return;
            select.dataset.pendingNew = '1';
            const lastValid = select.dataset.lastValid || '';
            if (lastValid) select.value = lastValid;
            select.disabled = true;
            showNewFolderModal(async (name) => {
                select.disabled = false;
                select.dataset.pendingNew = '0';
                if (!name) {
                    const previous = parseTreeSelectValue(lastValid, initial.folder);
                    await populateFolderTreeSelect(select, previous.folder, previous.subfolder);
                    return;
                }
                const created = await saveFolder(name, { render: false });
                if (created === false) {
                    const previous = parseTreeSelectValue(lastValid, initial.folder);
                    await populateFolderTreeSelect(select, previous.folder, previous.subfolder);
                    return;
                }
                await populateFolderTreeSelect(select, name, '');
                select.dispatchEvent(new CustomEvent('pa:folder-created-from-select', {
                    bubbles: true,
                    detail: { name }
                }));
            });
        };
        select.addEventListener('change', handleNewFolderSelection);
        select.addEventListener('input', handleNewFolderSelection);
        select.addEventListener('click', () => {
            if (select.dataset.noFolders === '1' && select.value === '__NEW__') {
                handleNewFolderSelection();
            }
        });
        return select;
    }

    function showNewFolderModal(callback) {
        const modal = document.createElement('div');
        modal.className = 'bm-modal';
        modal.dataset.noAutoclose = '1';
        Object.assign(modal.style, {
            position: 'absolute',
            zIndex: '10005',
            top: '48px',
            left: '50%',
            transform: 'translateX(-50%)'
        });

        const header = document.createElement('div');
        header.className = 'bm-header';
        header.textContent = 'New Folder';
        header.style.fontWeight = 'bold';
        header.style.fontSize = '14px';
        header.style.textAlign = 'center';
        header.style.margin = '4px 0 8px 0';

        const input = document.createElement('input');
        input.className = 'bm-input';
        input.placeholder = 'Folder name';

        const buttonContainer = document.createElement('div');
        Object.assign(buttonContainer.style, {
            display: 'flex',
            justifyContent: 'space-around',
            marginTop: '10px'
        });

        const createBtn = document.createElement('button');
        createBtn.textContent = 'Create';
        createBtn.className = 'bm-button';
        createBtn.addEventListener('click', () => {
            const name = input.value.trim();
            if (!name) {
                showFlash('Folder name cannot be empty', true, 'error');
                return;
            }
            modal.remove();
            callback(name);
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'bm-button';
        cancelBtn.addEventListener('click', () => {
            modal.remove();
            callback(null);
        });

        buttonContainer.append(createBtn, cancelBtn);
        modal.append(header, input, buttonContainer);
        panel.appendChild(modal);
        wireModalIdleTracking(modal);

        input.focus();
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                createBtn.click();
            } else if (e.key === 'Escape') {
                cancelBtn.click();
            }
        });
    }

    // ============================================================
    // SECTION: Notebook Data Operations
    // ------------------------------------------------------------
    // Notes are a first-class PA data module. They use the existing
    // folder model by storing the current folder name as `folderId`.
    // This keeps the MVP compatible with the later Folder Tree Refactor.
    // ============================================================

    const NoteService = (() => {
        const NOTES_KEY = STORAGE_KEYS.NOTES;
        const NOTE_FOLDERS_KEY = STORAGE_KEYS.NOTE_FOLDERS;

        function makeNoteId() {
            return `note-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
        }

        function normalizeTags(tags) {
            const source = Array.isArray(tags) ? tags : String(tags || '').split(',');
            const seen = new Set();
            const out = [];
            source.forEach(tag => {
                const clean = String(tag || '').trim().replace(/^#/, '').toLowerCase();
                if (!clean || seen.has(clean)) return;
                seen.add(clean);
                out.push(clean);
            });
            return out;
        }

        function sanitizeNote(raw, fallbackFolderId = '') {
            if (!raw || typeof raw !== 'object') return null;
            const now = Date.now();
            const createdAt = Number(raw.createdAt) || now;
            const updatedAt = Number(raw.updatedAt) || createdAt;
            const title = String(raw.title || '').trim() || 'Untitled Note';
            const content = String(raw.content || '');
            const format = raw.format === 'html' ? 'html' : 'text';
            const folderId = String(raw.folderId || raw.folder || fallbackFolderId || '').trim();
            return {
                id: raw.id || makeNoteId(),
                title,
                content,
                format,
                folderId,
                tags: normalizeTags(raw.tags),
                pinned: !!raw.pinned,
                archived: !!raw.archived,
                createdAt,
                updatedAt
            };
        }

        function sanitizeNoteList(list) {
            const source = Array.isArray(list) ? list : [];
            const byId = new Map();
            source.forEach(raw => {
                const note = sanitizeNote(raw);
                if (!note) return;
                const existing = byId.get(String(note.id));
                if (!existing || Number(note.updatedAt || 0) >= Number(existing.updatedAt || 0)) {
                    byId.set(String(note.id), note);
                }
            });
            return Array.from(byId.values());
        }

        function getNotes() {
            return sanitizeNoteList(StorageService.gmGet(NOTES_KEY, []));
        }

        function saveNotes(notes) {
            StorageService.gmSet(NOTES_KEY, sanitizeNoteList(notes));
        }

        function sanitizeNoteFolder(raw) {
            if (!raw || typeof raw !== 'object') return null;
            const name = String(raw.name || '').trim();
            if (!name) return null;
            return {
                name,
                pinned: !!raw.pinned,
                createdAt: Number(raw.createdAt) || Date.now(),
                updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || Date.now()
            };
        }

        function sanitizeNoteFolders(list) {
            const byName = new Map();
            (Array.isArray(list) ? list : []).forEach(raw => {
                const folder = sanitizeNoteFolder(raw);
                if (!folder) return;
                const key = folder.name.toLowerCase();
                const existing = byName.get(key);
                if (!existing || Number(folder.updatedAt || 0) >= Number(existing.updatedAt || 0)) {
                    byName.set(key, folder);
                }
            });
            return Array.from(byName.values());
        }

        function getNoteFolders() {
            const explicitFolders = sanitizeNoteFolders(StorageService.gmGet(NOTE_FOLDERS_KEY, []));
            const folderNames = new Set(explicitFolders.map(folder => folder.name.toLowerCase()));
            const inferredFolders = [];
            getNotes().forEach(note => {
                const name = String(note.folderId || '').trim();
                if (!name || folderNames.has(name.toLowerCase())) return;
                folderNames.add(name.toLowerCase());
                inferredFolders.push({ name, pinned: false, createdAt: note.createdAt || Date.now(), updatedAt: note.updatedAt || Date.now() });
            });
            return sanitizeNoteFolders([...explicitFolders, ...inferredFolders]);
        }

        function saveNoteFolders(folders) {
            StorageService.gmSet(NOTE_FOLDERS_KEY, sanitizeNoteFolders(folders));
        }

        function createNoteFolder(name) {
            const trimmed = String(name || '').trim();
            if (!trimmed) {
                showFlash('Folder name cannot be empty', true, 'error');
                return false;
            }
            const folders = getNoteFolders();
            if (folders.some(folder => folder.name.toLowerCase() === trimmed.toLowerCase())) {
                showFlash('Notebook folder already exists', true, 'error');
                return false;
            }
            const now = Date.now();
            folders.push({ name: trimmed, pinned: false, createdAt: now, updatedAt: now });
            saveNoteFolders(folders);
            showFlash(`Notebook folder created: ${trimmed}`, false, 'success');
            return true;
        }

        function renameNoteFolder(oldName, newName) {
            const oldTrim = String(oldName || '').trim();
            const newTrim = String(newName || '').trim();
            if (!oldTrim || !newTrim) {
                showFlash('Folder name cannot be empty', true, 'error');
                return false;
            }
            if (oldTrim === newTrim) return true;
            const folders = getNoteFolders();
            if (folders.some(folder => folder.name.toLowerCase() === newTrim.toLowerCase())) {
                showFlash('Notebook folder already exists', true, 'error');
                return false;
            }
            const target = folders.find(f => f.name === oldTrim);
            if (target) {
                target.name = newTrim;
                target.updatedAt = Date.now();
                saveNoteFolders(folders);
            }
            const notes = getNotes();
            let changed = false;
            notes.forEach(note => {
                if (note.folderId === oldTrim) {
                    note.folderId = newTrim;
                    note.updatedAt = Date.now();
                    changed = true;
                }
            });
            if (changed) saveNotes(notes);
            showFlash(`Notebook folder renamed to: ${newTrim}`, false, 'success');
            return true;
        }

        function updateNoteFolder(name, updates = {}) {
            const targetName = String(name || '').trim();
            if (!targetName) return false;
            const folders = getNoteFolders();
            const idx = folders.findIndex(f => f.name === targetName);
            if (idx === -1) return false;
            folders[idx] = { ...folders[idx], ...updates, updatedAt: Date.now() };
            saveNoteFolders(folders);
            return true;
        }

        function deleteNoteFolder(name) {
            const targetName = String(name || '').trim();
            if (!targetName) return false;
            const folders = getNoteFolders();
            const filtered = folders.filter(f => f.name !== targetName);
            if (filtered.length !== folders.length) {
                saveNoteFolders(filtered);
            }
            const notes = getNotes();
            const remainingNotes = notes.filter(n => n.folderId !== targetName);
            if (remainingNotes.length !== notes.length) {
                saveNotes(remainingNotes);
            }
            showFlash('Notebook folder deleted', false, 'success');
            return true;
        }

        async function validateFolderId(folderId) {
            const clean = String(folderId || '').trim();
            if (!clean) return '';
            const folders = getNoteFolders();
            return folders.some(folder => folder.name === clean) ? clean : '';
        }

        async function createNote(input = {}) {
            const folderId = await validateFolderId(input.folderId || input.folder || '');
            if (!folderId) {
                showFlash('Create/select a folder first', true, 'error');
                return null;
            }
            const now = Date.now();
            const note = sanitizeNote({
                ...input,
                id: makeNoteId(),
                folderId,
                createdAt: now,
                updatedAt: now
            }, folderId);
            if (!note) return null;
            const notes = getNotes();
            notes.push(note);
            saveNotes(notes);
            return note;
        }

        async function updateNote(id, updates = {}) {
            const targetId = String(id || '');
            if (!targetId) return null;
            const notes = getNotes();
            const idx = notes.findIndex(note => String(note.id) === targetId);
            if (idx < 0) return null;
            let folderId = updates.folderId !== undefined ? await validateFolderId(updates.folderId) : notes[idx].folderId;
            if (!folderId) folderId = notes[idx].folderId;
            const next = sanitizeNote({
                ...notes[idx],
                ...updates,
                folderId,
                tags: updates.tags !== undefined ? normalizeTags(updates.tags) : notes[idx].tags,
                updatedAt: Date.now()
            }, folderId);
            notes[idx] = next;
            saveNotes(notes);
            return next;
        }

        function deleteNote(id) {
            const targetId = String(id || '');
            if (!targetId) return false;
            const notes = getNotes();
            const next = notes.filter(note => String(note.id) !== targetId);
            if (next.length === notes.length) return false;
            saveNotes(next);
            return true;
        }

        async function duplicateNote(id) {
            const original = getNotes().find(note => String(note.id) === String(id));
            if (!original) return null;
            return createNote({
                ...original,
                id: undefined,
                title: `${original.title} Copy`,
                pinned: false,
                archived: false
            });
        }

        function searchNotes(notes, query = '') {
            const q = String(query || '').trim().toLowerCase();
            if (!q) return Array.isArray(notes) ? notes : [];
            return (Array.isArray(notes) ? notes : []).filter(note => {
                const haystack = [
                    note.title,
                    note.content,
                    note.folderId,
                    ...(Array.isArray(note.tags) ? note.tags : [])
                ].join('\n').toLowerCase();
                return haystack.includes(q);
            });
        }

        function sortNotes(notes, sortMode = 'updated-desc') {
            const list = Array.isArray(notes) ? [...notes] : [];
            const pinnedFirst = (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
            list.sort((a, b) => {
                const pinned = pinnedFirst(a, b);
                if (pinned) return pinned;
                if (sortMode === 'title') return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
                if (sortMode === 'created-desc') return Number(b.createdAt || 0) - Number(a.createdAt || 0);
                if (sortMode === 'created-asc') return Number(a.createdAt || 0) - Number(b.createdAt || 0);
                return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
            });
            return list;
        }

        function mergeNotes(incomingNotes = []) {
            const normalize = (value) => String(value ?? '').trim().toLowerCase();
            const existing = getNotes();
            const merged = [...existing];
            const keyFor = (note) => [normalize(note.title), normalize(note.content), normalize(note.folderId), String(note.createdAt || '')].join('|');
            const indexById = new Map(merged.map((note, idx) => [String(note.id), idx]));
            const keys = new Set(merged.map(keyFor));
            let addedNotes = 0;
            let updatedNotes = 0;

            (Array.isArray(incomingNotes) ? incomingNotes : []).forEach(raw => {
                const note = sanitizeNote(raw);
                if (!note || !note.folderId) return;
                const idKey = String(note.id);
                const existingIdx = indexById.get(idKey);
                if (existingIdx != null) {
                    const existingNote = merged[existingIdx];
                    if (Number(note.updatedAt || 0) > Number(existingNote.updatedAt || 0)) {
                        merged[existingIdx] = { ...existingNote, ...note };
                        updatedNotes++;
                    }
                    return;
                }
                const logicalKey = keyFor(note);
                if (keys.has(logicalKey)) return;
                merged.push(note);
                indexById.set(idKey, merged.length - 1);
                keys.add(logicalKey);
                addedNotes++;
            });

            saveNotes(merged);
            return { addedNotes, updatedNotes };
        }

        return Object.freeze({
            makeNoteId,
            normalizeTags,
            sanitizeNote,
            sanitizeNoteList,
            sanitizeNoteFolders,
            getNotes,
            saveNotes,
            getNoteFolders,
            saveNoteFolders,
            createNoteFolder,
            renameNoteFolder,
            updateNoteFolder,
            deleteNoteFolder,
            createNote,
            updateNote,
            deleteNote,
            duplicateNote,
            searchNotes,
            sortNotes,
            mergeNotes
        });
    })();
    // ============================================================
    // SECTION: Bookmark Data Operations
    // ------------------------------------------------------------
    // Independent bookmark storage with mandatory folder + one-level
    // sub-folder structure. This mirrors the Barcode folder behavior
    // without sharing barcode storage keys.
    // ============================================================

    const BOOKMARKS_KEY = STORAGE_KEYS.BOOKMARKS;
    const BOOKMARK_FOLDERS_KEY = STORAGE_KEYS.BOOKMARK_FOLDERS;
    const BOOKMARK_SUBFOLDERS_KEY = STORAGE_KEYS.BOOKMARK_SUBFOLDERS;
    const BOOKMARK_LEGACY_AUTO_FOLDER = 'Default';
    const BOOKMARK_LEGACY_AUTO_SUBFOLDER = 'General';
    const BOOKMARK_DEFAULTS_MIGRATION_KEY = STORAGE_KEYS.BOOKMARK_DEFAULTS_MIGRATION;
    let bookmarkActiveFolder = null;
    let bookmarkActiveSubFolder = null;
    let bookmarkSearchQuery = '';
    let selectedBookmarkIds = new Set();

    function normalizeBookmarkUrl(raw) {
        const value = String(raw || '').trim();
        if (!value) return '';
        try {
            const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
            const url = new URL(withProtocol);
            return url.href;
        } catch {
            return '';
        }
    }

    function getBookmarkDomain(rawUrl) {
        try {
            const normalized = normalizeBookmarkUrl(rawUrl);
            if (!normalized) return '';
            return new URL(normalized).hostname.replace(/^www\./i, '');
        } catch {
            return '';
        }
    }

    function getBookmarkOrigin(rawUrl) {
        try {
            const normalized = normalizeBookmarkUrl(rawUrl);
            if (!normalized) return '';
            return new URL(normalized).origin;
        } catch {
            return '';
        }
    }

    function getBookmarkFaviconUrl(rawUrl) {
        const origin = getBookmarkOrigin(rawUrl);
        return origin ? `${origin}/favicon.ico` : '';
    }

    function getBookmarkFallbackFaviconUrl(rawUrl) {
        const domain = getBookmarkDomain(rawUrl);
        return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : '';
    }

    function getBookmarks() {
        const list = gmGet(BOOKMARKS_KEY, []);
        return Array.isArray(list) ? list : [];
    }

    function sanitizeBookmarkList(list) {
        const input = Array.isArray(list) ? list : [];
        const normalize = (v) => String(v ?? '').trim().toLowerCase();
        const byKey = new Map();

        input.forEach((raw) => {
            if (!raw || typeof raw !== 'object') return;

            const normalizedUrl = normalizeBookmarkUrl(raw.url);
            if (!normalizedUrl) return;

            const folder = String(raw.folder || '').trim();
            if (!folder) return;

            const subfolder = String(raw.subfolder || '').trim();
            const name = String(raw.name || getBookmarkDomain(normalizedUrl) || normalizedUrl).trim();
            const createdAt = Number(raw.createdAt) || Date.now();
            const updatedAt = Number(raw.updatedAt) || createdAt;

            const candidate = {
                ...raw,
                id: raw.id || `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
                name,
                url: normalizedUrl,
                domain: raw.domain || getBookmarkDomain(normalizedUrl),
                folder,
                subfolder,
                favicon: raw.favicon || getBookmarkFaviconUrl(normalizedUrl),
                pinned: !!raw.pinned,
                createdAt,
                updatedAt
            };

            // Dedupe logical duplicates (same name/url/location).
            // If duplicates differ only by pin state, preserve pinned=true.
            const key = [
                normalize(candidate.name),
                normalize(candidate.url),
                normalize(candidate.folder),
                normalize(candidate.subfolder)
            ].join('|');

            const existing = byKey.get(key);
            if (!existing) {
                byKey.set(key, candidate);
                return;
            }

            const existingUpdated = Number(existing.updatedAt || 0);
            const candidateUpdated = Number(candidate.updatedAt || 0);
            const keepCandidate = candidateUpdated >= existingUpdated;
            const merged = keepCandidate ? { ...existing, ...candidate } : { ...candidate, ...existing };
            merged.pinned = !!(existing.pinned || candidate.pinned);
            const minCreated = Math.min(Number(existing.createdAt || 0) || Number(candidate.createdAt || 0) || Date.now(), Number(candidate.createdAt || 0) || Number(existing.createdAt || 0) || Date.now());
            merged.createdAt = minCreated;
            merged.updatedAt = Math.max(existingUpdated, candidateUpdated) || Date.now();
            byKey.set(key, merged);
        });

        return Array.from(byKey.values());
    }

    function saveBookmarks(list) {
        gmSet(BOOKMARKS_KEY, sanitizeBookmarkList(list));
    }

    function getBookmarkFolders() {
        const folders = gmGet(BOOKMARK_FOLDERS_KEY, []);
        return Array.isArray(folders) ? folders : [];
    }

    function saveBookmarkFolders(folders) {
        gmSet(BOOKMARK_FOLDERS_KEY, Array.isArray(folders) ? folders : []);
    }

    function getAllBookmarkSubFolders() {
        const subs = gmGet(BOOKMARK_SUBFOLDERS_KEY, []);
        return Array.isArray(subs) ? subs : [];
    }

    function saveBookmarkSubFolders(subs) {
        gmSet(BOOKMARK_SUBFOLDERS_KEY, Array.isArray(subs) ? subs : []);
    }

    function getBookmarkSubFolders(parentName) {
        return getAllBookmarkSubFolders().filter(sf => sf.parent === parentName);
    }

    function ensureBookmarkDefaults() {
        // Earlier builds created Default/General automatically. Remove that
        // bootstrap only once if it is still empty; never create folders here.
        if (gmGet(BOOKMARK_DEFAULTS_MIGRATION_KEY, false)) return;
        const bookmarks = getBookmarks();
        const defaultHasBookmarks = bookmarks.some(b => b.folder === BOOKMARK_LEGACY_AUTO_FOLDER);
        const subFolders = getAllBookmarkSubFolders();
        const defaultSubs = subFolders.filter(sf => sf.parent === BOOKMARK_LEGACY_AUTO_FOLDER);
        if (!defaultHasBookmarks && defaultSubs.length <= 1 && defaultSubs.every(sf => sf.name === BOOKMARK_LEGACY_AUTO_SUBFOLDER)) {
            saveBookmarkFolders(getBookmarkFolders().filter(f => f.name !== BOOKMARK_LEGACY_AUTO_FOLDER));
            saveBookmarkSubFolders(subFolders.filter(sf => sf.parent !== BOOKMARK_LEGACY_AUTO_FOLDER));
            if (bookmarkActiveFolder === BOOKMARK_LEGACY_AUTO_FOLDER) {
                bookmarkActiveFolder = null;
                bookmarkActiveSubFolder = null;
            }
        }
        gmSet(BOOKMARK_DEFAULTS_MIGRATION_KEY, true);
    }

    function saveBookmarkFolder(name) {
        const trimmed = String(name || '').trim();
        if (!trimmed) { showFlash('Folder name cannot be empty', true, 'error'); return false; }
        let folders = getBookmarkFolders();
        if (folders.some(f => f.name.toLowerCase() === trimmed.toLowerCase())) {
            showFlash('Bookmark folder already exists', true, 'error');
            return false;
        }
        folders.push({ name: trimmed, pinned: false });
        saveBookmarkFolders(folders);
        showFlash(`Bookmark folder created: ${trimmed}`, false, 'success');
        return true;
    }

    function saveBookmarkSubFolder(parentName, subName) {
        const trimmed = String(subName || '').trim();
        if (!trimmed) { showFlash('Sub-folder name cannot be empty', true, 'error'); return false; }
        let subs = getAllBookmarkSubFolders();
        if (subs.some(sf => sf.parent === parentName && sf.name.toLowerCase() === trimmed.toLowerCase())) {
            showFlash('Bookmark sub-folder already exists', true, 'error');
            return false;
        }
        subs.push({ parent: parentName, name: trimmed, pinned: false });
        saveBookmarkSubFolders(subs);
        showFlash(`Bookmark sub-folder created: ${trimmed}`, false, 'success');
        return true;
    }

    function updateBookmarkFolder(name, updates) {
        const folders = getBookmarkFolders().map(f => f.name === name ? { ...f, ...updates } : f);
        saveBookmarkFolders(folders);
        renderBookmarks();
    }

    function updateBookmarkSubFolder(parentName, subName, updates) {
        const subs = getAllBookmarkSubFolders().map(sf => (sf.parent === parentName && sf.name === subName) ? { ...sf, ...updates } : sf);
        saveBookmarkSubFolders(subs);
        renderBookmarks();
    }

    function renameBookmarkFolder(oldName, newName) {
        const trimmed = String(newName || '').trim();
        if (!trimmed) { showFlash('Invalid folder name', true, 'error'); return; }
        let folders = getBookmarkFolders();
        if (folders.some(f => f.name.toLowerCase() === trimmed.toLowerCase())) {
            showFlash('Folder name already exists', true, 'error');
            return;
        }
        folders = folders.map(f => f.name === oldName ? { ...f, name: trimmed } : f);
        saveBookmarkFolders(folders);
        saveBookmarkSubFolders(getAllBookmarkSubFolders().map(sf => sf.parent === oldName ? { ...sf, parent: trimmed } : sf));
        saveBookmarks(getBookmarks().map(b => b.folder === oldName ? { ...b, folder: trimmed, updatedAt: Date.now() } : b));
        if (bookmarkActiveFolder === oldName) bookmarkActiveFolder = trimmed;
        renderBookmarks();
        showFlash('Bookmark folder renamed', false, 'success');
    }

    function renameBookmarkSubFolder(parentName, oldName, newName) {
        const trimmed = String(newName || '').trim();
        if (!trimmed) { showFlash('Invalid sub-folder name', true, 'error'); return; }
        let subs = getAllBookmarkSubFolders();
        if (subs.some(sf => sf.parent === parentName && sf.name.toLowerCase() === trimmed.toLowerCase())) {
            showFlash('Sub-folder name already exists', true, 'error');
            return;
        }
        subs = subs.map(sf => (sf.parent === parentName && sf.name === oldName) ? { ...sf, name: trimmed } : sf);
        saveBookmarkSubFolders(subs);
        saveBookmarks(getBookmarks().map(b => (b.folder === parentName && b.subfolder === oldName) ? { ...b, subfolder: trimmed, updatedAt: Date.now() } : b));
        if (bookmarkActiveFolder === parentName && bookmarkActiveSubFolder === oldName) bookmarkActiveSubFolder = trimmed;
        renderBookmarks();
        showFlash('Bookmark sub-folder renamed', false, 'success');
    }

    function deleteBookmarkFolder(folderName) {
        saveBookmarkFolders(getBookmarkFolders().filter(f => f.name !== folderName));
        saveBookmarkSubFolders(getAllBookmarkSubFolders().filter(sf => sf.parent !== folderName));
        saveBookmarks(getBookmarks().filter(b => b.folder !== folderName));
        if (bookmarkActiveFolder === folderName) { bookmarkActiveFolder = null; bookmarkActiveSubFolder = null; }
        renderBookmarks();
        showFlash('Bookmark folder deleted', false, 'success');
    }

    function deleteBookmarkSubFolder(parentName, subName) {
        saveBookmarkSubFolders(getAllBookmarkSubFolders().filter(sf => !(sf.parent === parentName && sf.name === subName)));
        saveBookmarks(getBookmarks().filter(b => !(b.folder === parentName && b.subfolder === subName)));
        if (bookmarkActiveFolder === parentName && bookmarkActiveSubFolder === subName) bookmarkActiveSubFolder = null;
        renderBookmarks();
        showFlash('Bookmark sub-folder deleted', false, 'success');
    }

    function addOrUpdateBookmark(bookmark) {
        const now = Date.now();
        const normalizedUrl = normalizeBookmarkUrl(bookmark.url);
        if (!normalizedUrl) { showFlash('Invalid URL', true, 'error'); return false; }
        const folder = String(bookmark.folder || '').trim();
        const subfolder = String(bookmark.subfolder || '').trim();
        if (!folder) {
            showFlash('Create/select a bookmark folder first', true, 'error');
            return false;
        }
        if (!getBookmarkFolders().some(f => f.name === folder)) {
            showFlash('Bookmark folder not found', true, 'error');
            return false;
        }
        if (subfolder && !getBookmarkSubFolders(folder).some(sf => sf.name === subfolder)) {
            showFlash('Bookmark sub-folder not found', true, 'error');
            return false;
        }
        const domain = getBookmarkDomain(normalizedUrl);
        const next = {
            id: bookmark.id || `${now}-${Math.floor(Math.random() * 100000)}`,
            name: String(bookmark.name || domain || normalizedUrl).trim(),
            url: normalizedUrl,
            domain,
            folder,
            subfolder,
            favicon: getBookmarkFaviconUrl(normalizedUrl),
            pinned: !!bookmark.pinned,
            createdAt: bookmark.createdAt || now,
            updatedAt: now
        };
        let bookmarks = getBookmarks();
        const idx = bookmarks.findIndex(b => String(b.id) === String(next.id));
        if (idx >= 0) bookmarks[idx] = { ...bookmarks[idx], ...next };
        else bookmarks.push(next);
        saveBookmarks(bookmarks);
        return true;
    }

    function updateBookmark(id, updates) {
        const bookmarks = getBookmarks().map(b => String(b.id) === String(id) ? { ...b, ...updates, updatedAt: Date.now() } : b);
        saveBookmarks(bookmarks);
        renderBookmarks();
    }

    function updateBookmarksByIds(ids, updates) {
        const idSet = new Set((ids || []).map(id => String(id)));
        if (!idSet.size) return 0;
        let changed = 0;
        const bookmarks = getBookmarks().map(bookmark => {
            if (!idSet.has(String(bookmark.id))) return bookmark;
            changed++;
            return { ...bookmark, ...updates, updatedAt: Date.now() };
        });
        saveBookmarks(bookmarks);
        renderBookmarks();
        return changed;
    }

    function deleteBookmark(id) {
        saveBookmarks(getBookmarks().filter(b => String(b.id) !== String(id)));
        selectedBookmarkIds.delete(String(id));
        renderBookmarks();
        showFlash('Bookmark deleted', false, 'success');
    }

    function deleteBookmarksByIds(ids) {
        const idSet = new Set((ids || []).map(id => String(id)));
        if (!idSet.size) return 0;
        const before = getBookmarks();
        const after = before.filter(bookmark => !idSet.has(String(bookmark.id)));
        saveBookmarks(after);
        idSet.forEach(id => selectedBookmarkIds.delete(id));
        renderBookmarks();
        return before.length - after.length;
    }

    function moveBookmarkFolderTo(folderName, destFolder) {
        if (!destFolder || destFolder === folderName) {
            showFlash('Folder is already at this location', false, 'info');
            return;
        }
        const ownSubs = getBookmarkSubFolders(folderName);
        const ownBookmarks = getBookmarks().filter(b => b.folder === folderName);
        if (ownSubs.length > 0 || ownBookmarks.length > 0) {
            showFlash('Move or remove its sub-folders/bookmarks first', true, 'error');
            return;
        }
        const folders = getBookmarkFolders();
        if (!folders.some(f => f.name === destFolder)) { showFlash('Destination not found', true, 'error'); return; }
        let subs = getAllBookmarkSubFolders();
        if (subs.some(sf => sf.parent === destFolder && sf.name.toLowerCase() === folderName.toLowerCase())) {
            showFlash('Destination already has a sub-folder with this name', true, 'error');
            return;
        }
        if (!subs.some(sf => sf.parent === destFolder && sf.name.toLowerCase() === folderName.toLowerCase())) {
            subs.push({ parent: destFolder, name: folderName, pinned: false });
        }
        subs = subs.filter(sf => sf.parent !== folderName);
        saveBookmarkSubFolders(subs);
        saveBookmarkFolders(folders.filter(f => f.name !== folderName));
        saveBookmarks(getBookmarks().map(b => b.folder === folderName ? { ...b, folder: destFolder, subfolder: folderName, updatedAt: Date.now() } : b));
        if (bookmarkActiveFolder === folderName) { bookmarkActiveFolder = destFolder; bookmarkActiveSubFolder = folderName; }
        renderBookmarks();
        showFlash(`Moved "${folderName}" into "${destFolder}"`, false, 'success');
    }

    function moveBookmarkSubFolderTo(parentName, subName, destFolder) {
        let folders = getBookmarkFolders();
        let subs = getAllBookmarkSubFolders();
        if (!destFolder) {
            const subBookmarks = getBookmarks().filter(b => b.folder === parentName && b.subfolder === subName);
            if (subBookmarks.length > 0) {
                showFlash('Move bookmarks out before moving sub-folder to Root', true, 'error');
                return;
            }
            if (!folders.some(f => f.name.toLowerCase() === subName.toLowerCase())) {
                folders.push({ name: subName, pinned: false });
                saveBookmarkFolders(folders);
            }
            subs = subs.filter(sf => !(sf.parent === parentName && sf.name === subName));
            saveBookmarkSubFolders(subs);
            if (bookmarkActiveFolder === parentName && bookmarkActiveSubFolder === subName) { bookmarkActiveFolder = subName; bookmarkActiveSubFolder = null; }
            renderBookmarks();
            showFlash(`Moved "${subName}" to Root`, false, 'success');
            return;
        }
        if (!folders.some(f => f.name === destFolder)) { showFlash('Destination not found', true, 'error'); return; }
        if (!subs.some(sf => sf.parent === destFolder && sf.name.toLowerCase() === subName.toLowerCase())) {
            subs.push({ parent: destFolder, name: subName, pinned: false });
        }
        subs = subs.filter(sf => !(sf.parent === parentName && sf.name === subName));
        saveBookmarkSubFolders(subs);
        saveBookmarks(getBookmarks().map(b => (b.folder === parentName && b.subfolder === subName) ? { ...b, folder: destFolder, subfolder: subName, updatedAt: Date.now() } : b));
        if (bookmarkActiveFolder === parentName && bookmarkActiveSubFolder === subName) bookmarkActiveFolder = destFolder;
        renderBookmarks();
        showFlash(`Moved "${subName}" into "${destFolder}"`, false, 'success');
    }

    // ============================================================
    // SECTION: Barcode Data Operations
    // ------------------------------------------------------------
    // All barcode CRUD still uses the existing bm_barcodes storage
    // shape: { id, name, value, format, folder, pinned }.
    // ============================================================

    // --- Todo List Functions ---
    let tasksCache = null;
    let tasksCacheDirty = true;

    function getTasks() {
        if (!tasksCacheDirty && Array.isArray(tasksCache)) return tasksCache;
        let tasks = gmGet(STORAGE_KEYS.TASKS, []);
        if (!Array.isArray(tasks)) tasks = [];
        tasksCache = tasks;
        tasksCacheDirty = false;
        return tasksCache;
    }

    function saveTasks(tasks) {
        gmSet(STORAGE_KEYS.TASKS, tasks);
        tasksCache = tasks;
        tasksCacheDirty = false;
        if (typeof updateTaskTabBadge === 'function') {
            updateTaskTabBadge();
        }
        if (typeof updateReminderCountdownDisplays === 'function') {
            updateReminderCountdownDisplays();
        }
        if (typeof scheduleReminderCheck === 'function') {
            scheduleReminderCheck();
        }
    }

    function composeTaskDueDate(dateValue, timeValue, options = {}) {
        const datePart = String(dateValue || '').trim();
        const timePart = String(timeValue || '').trim();
        const defaultTime = options.defaultTime || '09:00';
        const useTodayForTimeOnly = options.useTodayForTimeOnly !== false;

        if (datePart) {
            return new Date(`${datePart}T${timePart || defaultTime}`).toISOString();
        }

        if (timePart && useTodayForTimeOnly) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            return new Date(`${yyyy}-${mm}-${dd}T${timePart}`).toISOString();
        }

        return null;
    }

    function getActiveSnoozedTasks(tasks = getTasks(), now = Date.now()) {
        return tasks.filter(task => {
            if (task.completed || task.archived || task.reminderSent || !task.snoozedUntil) return false;
            const snoozedAt = new Date(task.snoozedUntil).getTime();
            return Number.isFinite(snoozedAt) && snoozedAt >= now - 1000;
        }).sort((a, b) => new Date(a.snoozedUntil).getTime() - new Date(b.snoozedUntil).getTime());
    }

    function getNearestActiveSnooze(tasks = getTasks(), now = Date.now()) {
        const active = getActiveSnoozedTasks(tasks, now);
        if (!active.length) return null;
        const task = active[0];
        const snoozedAt = new Date(task.snoozedUntil).getTime();
        return {
            task,
            count: active.length,
            remainingMs: Math.max(0, snoozedAt - now)
        };
    }

    function formatCountdownClock(ms) {
        const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours > 0) {
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function getTodoProjects() {
        let projects = gmGet(STORAGE_KEYS.TODO_PROJECTS, null);
        if (!Array.isArray(projects) || projects.length === 0) {
            projects = ['Personal', 'Work', 'Shopping', 'Programming'];
            gmSet(STORAGE_KEYS.TODO_PROJECTS, projects);
        }
        return projects;
    }

    function saveTodoProjects(projects) {
        gmSet(STORAGE_KEYS.TODO_PROJECTS, projects);
    }

    function addTodoProject(name) {
        const trimmed = name.trim();
        if (!trimmed) return false;
        const projects = getTodoProjects();
        if (projects.some(p => p.toLowerCase() === trimmed.toLowerCase())) return false;
        projects.push(trimmed);
        saveTodoProjects(projects);
        return true;
    }

    function deleteTodoProject(name) {
        const projects = getTodoProjects();
        const index = projects.indexOf(name);
        if (index === -1) return false;
        projects.splice(index, 1);
        saveTodoProjects(projects);

        // Cascade task reassignment
        const tasks = getTasks();
        const fallbackProject = projects[0] || 'Personal';
        let changed = false;
        tasks.forEach(t => {
            if (t.project === name) {
                t.project = fallbackProject;
                changed = true;
            }
        });
        if (changed) {
            saveTasks(tasks);
        }
        return true;
    }

    function renameTodoProject(oldName, newName) {
        const trimmedNew = newName.trim();
        if (!trimmedNew || oldName === trimmedNew) return false;
        const projects = getTodoProjects();
        const index = projects.indexOf(oldName);
        if (index === -1) return false;
        if (projects.some(p => p.toLowerCase() === trimmedNew.toLowerCase())) return false;
        projects[index] = trimmedNew;
        saveTodoProjects(projects);

        // Cascade task updates
        const tasks = getTasks();
        let changed = false;
        tasks.forEach(t => {
            if (t.project === oldName) {
                t.project = trimmedNew;
                changed = true;
            }
        });
        if (changed) {
            saveTasks(tasks);
        }
        return true;
    }

    function getNextRecurrenceDate(currentDateStr, recurrence) {
        const date = new Date(currentDateStr);
        if (isNaN(date.getTime())) return null;
        if (recurrence === 'daily') {
            date.setDate(date.getDate() + 1);
        } else if (recurrence === 'weekly') {
            date.setDate(date.getDate() + 7);
        } else if (recurrence === 'monthly') {
            date.setMonth(date.getMonth() + 1);
        }
        return date.toISOString();
    }

    function extractTags(text) {
        const matches = text.match(/#\w+/g);
        if (!matches) return [];
        return matches.map(m => m.substring(1));
    }

    function parseTaskTextWithNLP(text) {
        let title = text;
        let dueDate = null;
        let matchedText = '';

        try {
            const now = new Date();
            const lowerText = text.toLowerCase();

            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

            // --- Time parsing helper ---
            function parseTimeFromText(str) {
                // Matches: "at 5pm", "at 5:30pm", "at 17:00", "5pm", "5:30 pm", "at 5 pm"
                const timeRegex = /(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
                const m = str.match(timeRegex);
                if (m) {
                    let hours = parseInt(m[1], 10);
                    const minutes = m[2] ? parseInt(m[2], 10) : 0;
                    const ampm = m[3] ? m[3].toLowerCase() : null;
                    if (ampm === 'pm' && hours < 12) hours += 12;
                    if (ampm === 'am' && hours === 12) hours = 0;
                    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
                        return { hours, minutes, matched: m[0] };
                    }
                }
                return null;
            }

            // --- Date patterns ---
            const patterns = [];

            // "today"
            patterns.push({
                regex: /\btoday\b/i,
                getDate: () => { const d = new Date(now); return d; }
            });

            // "tonight"
            patterns.push({
                regex: /\btonight\b/i,
                getDate: () => { const d = new Date(now); d.setHours(21, 0, 0, 0); return d; }
            });

            // "tomorrow"
            patterns.push({
                regex: /\btomorrow\b/i,
                getDate: () => { const d = new Date(now); d.setDate(d.getDate() + 1); return d; }
            });

            // "yesterday"
            patterns.push({
                regex: /\byesterday\b/i,
                getDate: () => { const d = new Date(now); d.setDate(d.getDate() - 1); return d; }
            });

            // "next week"
            patterns.push({
                regex: /\bnext\s+week\b/i,
                getDate: () => { const d = new Date(now); d.setDate(d.getDate() + 7); return d; }
            });

            // "next month"
            patterns.push({
                regex: /\bnext\s+month\b/i,
                getDate: () => { const d = new Date(now); d.setMonth(d.getMonth() + 1); return d; }
            });

            // "next Monday", "next Tuesday", etc.
            dayNames.forEach((dayName, dayIdx) => {
                patterns.push({
                    regex: new RegExp('\\bnext\\s+' + dayName + '\\b', 'i'),
                    getDate: () => {
                        const d = new Date(now);
                        const currentDay = d.getDay();
                        let diff = dayIdx - currentDay;
                        if (diff <= 0) diff += 7;
                        d.setDate(d.getDate() + diff);
                        return d;
                    }
                });
            });

            // "on Monday", "on Tuesday", "Monday", "Tuesday" etc. (next occurrence)
            dayNames.forEach((dayName, dayIdx) => {
                patterns.push({
                    regex: new RegExp('(?:\\bon\\s+)?' + dayName + '\\b', 'i'),
                    getDate: () => {
                        const d = new Date(now);
                        const currentDay = d.getDay();
                        let diff = dayIdx - currentDay;
                        if (diff <= 0) diff += 7;
                        d.setDate(d.getDate() + diff);
                        return d;
                    }
                });
            });

            // "in 2 hours", "in 3 days", "in 1 week", "in 2 months", "in 30 minutes"
            patterns.push({
                regex: /\bin\s+(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks|month|months)\b/i,
                getDate: (match) => {
                    const num = parseInt(match[1], 10);
                    const unit = match[2].toLowerCase();
                    const d = new Date(now);
                    if (unit.startsWith('min')) d.setMinutes(d.getMinutes() + num);
                    else if (unit.startsWith('hour') || unit.startsWith('hr')) d.setHours(d.getHours() + num);
                    else if (unit.startsWith('day')) d.setDate(d.getDate() + num);
                    else if (unit.startsWith('week')) d.setDate(d.getDate() + num * 7);
                    else if (unit.startsWith('month')) d.setMonth(d.getMonth() + num);
                    return d;
                }
            });

            // "Jan 15", "January 15", "Feb 3rd", "March 4th 2025"
            const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            const monthLong = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
            const monthPattern = monthNames.join('|') + '|' + monthLong.join('|');
            patterns.push({
                regex: new RegExp('\\b(' + monthPattern + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s]+(\\d{4}))?\\b', 'i'),
                getDate: (match) => {
                    const monthStr = match[1].toLowerCase().substring(0, 3);
                    const monthIdx = monthNames.indexOf(monthStr);
                    const day = parseInt(match[2], 10);
                    const year = match[3] ? parseInt(match[3], 10) : now.getFullYear();
                    if (monthIdx >= 0 && day >= 1 && day <= 31) {
                        return new Date(year, monthIdx, day);
                    }
                    return null;
                }
            });

            // "12/25", "12/25/2025", "2025-06-23"
            patterns.push({
                regex: /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/,
                getDate: (match) => {
                    const m = parseInt(match[1], 10);
                    const d = parseInt(match[2], 10);
                    let y = match[3] ? parseInt(match[3], 10) : now.getFullYear();
                    if (y < 100) y += 2000;
                    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
                        return new Date(y, m - 1, d);
                    }
                    return null;
                }
            });

            patterns.push({
                regex: /\b(\d{4})-(\d{2})-(\d{2})\b/,
                getDate: (match) => {
                    return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
                }
            });

            // Try each pattern
            for (const pattern of patterns) {
                const match = lowerText.match(pattern.regex);
                if (match) {
                    const dateResult = pattern.getDate(match);
                    if (dateResult && !isNaN(dateResult.getTime())) {
                        dueDate = dateResult;
                        // Find the actual matched text in the original string (case-preserving)
                        const originalMatch = text.match(pattern.regex);
                        matchedText = originalMatch ? originalMatch[0] : match[0];
                        break;
                    }
                }
            }

            // Parse time component ("at 5pm", "at 17:00", "5:30pm", etc.)
            if (dueDate) {
                // Remove the date match from text, then search remaining for time
                const remaining = text.replace(matchedText, '');
                const timeParsed = parseTimeFromText(remaining);
                if (timeParsed) {
                    dueDate.setHours(timeParsed.hours, timeParsed.minutes, 0, 0);
                    matchedText += ' ' + timeParsed.matched;
                } else if (dueDate.getHours() === now.getHours() && dueDate.getMinutes() === now.getMinutes()) {
                    // If no explicit time given and it's a relative date (today/tomorrow/etc), set to 9:00 AM default
                    const isRelative = /\b(today|tomorrow|yesterday|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text);
                    if (isRelative) {
                        dueDate.setHours(9, 0, 0, 0);
                    }
                }
                dueDate = dueDate.toISOString();
                title = text.replace(new RegExp(matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split(/\s+/).join('\\s+'), 'i'), '').replace(/\s+/g, ' ').trim();
            } else {
                // No date match found; try standalone time for today
                const timeParsed = parseTimeFromText(lowerText);
                if (timeParsed) {
                    dueDate = new Date(now);
                    dueDate.setHours(timeParsed.hours, timeParsed.minutes, 0, 0);
                    dueDate = dueDate.toISOString();
                    const originalTimeMatch = text.match(/(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i);
                    if (originalTimeMatch) {
                        title = text.replace(originalTimeMatch[0], '').replace(/\s+/g, ' ').trim();
                    }
                }
            }
        } catch (e) {
            console.error('NLP date parsing error:', e);
        }

        const tags = extractTags(text);
        tags.forEach(t => {
            title = title.replace(`#${t}`, '').replace(/\s+/g, ' ').trim();
        });

        return {
            title: title || 'Untitled Task',
            dueDate,
            tags
        };
    }

    function addTask(title, priority = 'P4', dueDate = null, linkedItem = null, project = 'Personal', recurrence = 'none', description = '', tags = [], reminderTime = null) {
        const tasks = getTasks();
        const newTask = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            title: title.trim(),
            description: description.trim(),
            project,
            priority,
            dueDate,
            reminderTime,
            reminderSent: false,
            recurrence,
            subtasks: [],
            tags,
            completed: false,
            archived: false,
            snoozedUntil: null,
            createdAt: Date.now(),
            completedAt: null,
            linkedItem,
            pomodoro: {
                totalSessions: 0,
                elapsedTime: 0
            }
        };
        tasks.push(newTask);
        saveTasks(tasks);
        return newTask;
    }

    function updateTask(id, updates) {
        const tasks = getTasks();
        const task = tasks.find(t => t.id === id);
        if (task) {
            Object.assign(task, updates);
            if (Object.prototype.hasOwnProperty.call(updates, 'reminderTime') && !Object.prototype.hasOwnProperty.call(updates, 'snoozedUntil')) {
                task.snoozedUntil = null;
            }
            saveTasks(tasks);
        }
    }

    function deleteTask(id) {
        let tasks = getTasks();
        tasks = tasks.filter(t => t.id !== id);
        saveTasks(tasks);
    }

    function getPendingTaskReminderCount(tasks = getTasks()) {
        const now = Date.now();
        return tasks.filter(task => !task.completed && !task.archived && task.reminderTime && new Date(task.reminderTime).getTime() <= now).length;
    }

    function snoozeTaskReminder(id, minutes = 10) {
        const tasks = getTasks();
        const task = tasks.find(t => t.id === id);
        if (!task || task.completed || task.archived) return false;
        const snoozeMinutes = Math.max(1, parseInt(minutes, 10) || 10);
        task.reminderTime = new Date(Date.now() + (snoozeMinutes * 60 * 1000)).toISOString();
        task.snoozedUntil = task.reminderTime;
        task.reminderSent = false;
        saveTasks(tasks);
        return true;
    }

    function stopSnoozedTaskReminder(id) {
        const tasks = getTasks();
        const task = tasks.find(t => t.id === id);
        if (!task || task.completed || task.archived || !task.snoozedUntil) return false;
        task.snoozedUntil = null;
        task.reminderSent = true;
        task.reminderTime = task.dueDate || null;
        saveTasks(tasks);
        return true;
    }

    function toggleTask(id) {
        const tasks = getTasks();
        const task = tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            if (task.completed) {
                task.completedAt = Date.now();
                task.snoozedUntil = null;

                // Handle recurrence
                if (task.recurrence && task.recurrence !== 'none' && task.dueDate) {
                    const nextDate = getNextRecurrenceDate(task.dueDate, task.recurrence);
                    if (nextDate) {
                        // Create completed instance copy for archive history
                        const archiveCopy = {
                            ...task,
                            id: Date.now() + Math.floor(Math.random() * 1000),
                            completed: true,
                            archived: true,
                            recurrence: 'none' // completed copy does not recur
                        };
                        tasks.push(archiveCopy);

                        // Advance the original task to the next date
                        task.completed = false;
                        task.completedAt = null;
                        task.dueDate = nextDate;
                        task.reminderSent = false;
                        task.snoozedUntil = null;
                        if (task.reminderTime) {
                            const offset = new Date(task.dueDate).getTime() - new Date(task.reminderTime).getTime();
                            task.reminderTime = new Date(new Date(nextDate).getTime() - offset).toISOString();
                        }
                    }
                }
            } else {
                task.completedAt = null;
            }
            saveTasks(tasks);
        }
    }

    function clearCompletedTasks() {
        let tasks = getTasks();
        tasks = tasks.filter(t => !t.completed);
        saveTasks(tasks);
    }

    const WELLNESS_SETTINGS_KEY = STORAGE_KEYS.WELLNESS_SETTINGS;
    const WELLNESS_WATER_INTERVAL_MS = 60 * 60 * 1000;
    const WELLNESS_STRETCH_INTERVAL_MS = 90 * 60 * 1000;
    const WELLNESS_STRETCH_BREAK_MINUTES = 5;
    let refreshWellnessTodoToggles = null;

    function clampWellnessMinutes(value, fallback, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, Math.round(n)));
    }

    function normalizeWellnessSettings(raw) {
        const data = raw && typeof raw === 'object' ? raw : {};
        const waterNextAt = Number(data.waterNextAt);
        const stretchNextAt = Number(data.stretchNextAt);
        return {
            waterEnabled: Boolean(data.waterEnabled),
            stretchEnabled: Boolean(data.stretchEnabled),
            waterIntervalMinutes: clampWellnessMinutes(data.waterIntervalMinutes, 60, 5, 480),
            workMinutes: clampWellnessMinutes(data.workMinutes, 90, 5, 480),
            breakMinutes: clampWellnessMinutes(data.breakMinutes, WELLNESS_STRETCH_BREAK_MINUTES, 1, 120),
            waterNextAt: Number.isFinite(waterNextAt) ? waterNextAt : 0,
            stretchNextAt: Number.isFinite(stretchNextAt) ? stretchNextAt : 0
        };
    }

    function getWellnessWaterIntervalMs(settings = getWellnessSettings()) {
        return clampWellnessMinutes(settings.waterIntervalMinutes, 60, 5, 480) * 60 * 1000;
    }

    function getWellnessStretchIntervalMs(settings = getWellnessSettings()) {
        return clampWellnessMinutes(settings.workMinutes, 90, 5, 480) * 60 * 1000;
    }

    function getWellnessBreakMinutes(settings = getWellnessSettings()) {
        return clampWellnessMinutes(settings.breakMinutes, WELLNESS_STRETCH_BREAK_MINUTES, 1, 120);
    }

    function getWellnessSettings() {
        return normalizeWellnessSettings(gmGet(WELLNESS_SETTINGS_KEY, null));
    }

    function saveWellnessSettings(settings) {
        gmSet(WELLNESS_SETTINGS_KEY, normalizeWellnessSettings(settings));
        if (typeof refreshWellnessTodoToggles === 'function') {
            refreshWellnessTodoToggles();
        }
        if (typeof scheduleReminderCheck === 'function') {
            scheduleReminderCheck();
        }
    }

    function setWellnessToggle(settings, key, enabled, intervalMs) {
        settings[key] = Boolean(enabled);
        const nextKey = key === 'waterEnabled' ? 'waterNextAt' : 'stretchNextAt';
        settings[nextKey] = enabled ? Date.now() + intervalMs : 0;
    }

    function hasPendingReminderDemand() {
        const tasks = getTasks();
        const hasTaskReminders = tasks.some(task => !task.completed && !task.archived && task.reminderTime && !task.reminderSent);
        if (hasTaskReminders) return true;
        const wellness = getWellnessSettings();
        return !!(wellness.waterEnabled || wellness.stretchEnabled);
    }

    function isChromeLikeBrowser() {
        const ua = String(navigator?.userAgent || '');
        return /Chrome|Chromium|Edg\//i.test(ua) && !/Firefox|FxiOS/i.test(ua);
    }

    function ensureNotificationPermissionIfNeeded() {
        if (typeof GM_notification === 'function' && !isChromeLikeBrowser()) return;
        if (typeof Notification !== 'function') return;
        if (Notification.permission !== 'default') return;
        if (!hasPendingReminderDemand()) return;
        try {
            const result = Notification.requestPermission();
            if (result && typeof result.catch === 'function') {
                result.catch(() => { });
            }
        } catch { }
    }

    let reminderAudioCtx = null;

    function getReminderAudioContext() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        if (!reminderAudioCtx) reminderAudioCtx = new AudioCtx();
        return reminderAudioCtx;
    }

    function unlockReminderAudio() {
        try {
            const ctx = getReminderAudioContext();
            if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
                ctx.resume().catch(() => { });
            }
        } catch { }
    }

    ['click', 'keydown', 'touchstart'].forEach(eventName => {
        document.addEventListener(eventName, unlockReminderAudio, { once: true, passive: true });
    });

    function playReminderSound() {
        try {
            const ctx = getReminderAudioContext();
            if (!ctx) return false;
            if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
                ctx.resume().catch(() => { });
            }
            const gain = ctx.createGain();
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.48);
            return true;
        } catch {
            return false;
        }
    }

    function sendNativeNotification({ title, body, tag, onClick }) {
        if (typeof Notification !== 'function' || Notification.permission !== 'granted') return false;
        try {
            const n = new Notification(title, {
                body,
                tag,
                requireInteraction: true,
                silent: false
            });
            n.onclick = () => {
                try { window.focus(); } catch { }
                if (typeof onClick === 'function') onClick();
                try { n.close(); } catch { }
            };
            return true;
        } catch {
            return false;
        }
    }

    function sendGmNotification({ title, body, tag, onClick }) {
        if (typeof GM_notification !== 'function') return false;
        try {
            GM_notification({
                title,
                text: body,
                tag,
                onclick: onClick
            });
            return true;
        } catch {
            return false;
        }
    }

    function sendChromeHistoryNotification({ title, body, tag, onClick }) {
        if (!isChromeLikeBrowser() || typeof Notification !== 'function') return false;
        const nativePayload = {
            title,
            body,
            tag: `${tag || 'bm-reminder'}-windows-history`,
            onClick
        };

        if (Notification.permission === 'granted') {
            return sendNativeNotification(nativePayload);
        }

        if (Notification.permission === 'default') {
            try {
                const result = Notification.requestPermission();
                if (result && typeof result.then === 'function') {
                    result.then(permission => {
                        if (permission === 'granted') sendNativeNotification(nativePayload);
                    }).catch(() => { });
                    return true;
                }
            } catch { }
        }

        return false;
    }

    function sendAppNotification({ title, body, tag, onClick, fallbackType = 'info' }) {
        let sent = false;

        playReminderSound();

        sent = sendGmNotification({ title, body, tag, onClick });

        const sentToWindowsHistory = sendChromeHistoryNotification({ title, body, tag, onClick });

        if (!sent && !sentToWindowsHistory) {
            sent = sendNativeNotification({ title, body, tag, onClick });
        }

        if (!sent && !sentToWindowsHistory) {
            const fallbackMessage = [title, body].filter(Boolean).join(' — ');
            if (fallbackMessage) {
                showFlash(fallbackMessage, fallbackType === 'error', fallbackType);
            }
        }

        return sent || sentToWindowsHistory;
    }

    function sendWellnessNotification(kind) {
        if (kind === 'water') {
            return sendAppNotification({
                title: '💧 Water Reminder',
                body: 'Time to drink some water and recharge a little.',
                tag: 'bm-wellness-water',
                onClick: () => window.focus()
            });
        }

        const settings = getWellnessSettings();
        return sendAppNotification({
            title: '🧘 Stretch Break Reminder',
            body: `You have been working for ${settings.workMinutes} minutes. Take a ${getWellnessBreakMinutes(settings)}-minute break and do a few stretches.`,
            tag: 'bm-wellness-stretch',
            onClick: () => window.focus()
        });
    }

    // Notification & Reminder CheckerSave Changes
    const REMINDER_FALLBACK_POLL_MS = 60 * 1000;
    const REMINDER_MIN_DELAY_MS = 1000;
    let reminderCheckTimer = null;

    function getNextReminderDelay(now = Date.now()) {
        let nextAt = now + REMINDER_FALLBACK_POLL_MS;

        const tasks = getTasks();
        tasks.forEach(task => {
            if (task.completed || task.archived || task.reminderSent || !task.reminderTime) return;
            const reminderAt = new Date(task.reminderTime).getTime();
            if (Number.isFinite(reminderAt)) {
                nextAt = Math.min(nextAt, reminderAt);
            }
        });

        const wellness = getWellnessSettings();
        if (wellness.waterEnabled) {
            const waterAt = Number(wellness.waterNextAt) || (now + getWellnessWaterIntervalMs(wellness));
            nextAt = Math.min(nextAt, waterAt);
        }
        if (wellness.stretchEnabled) {
            const stretchAt = Number(wellness.stretchNextAt) || (now + getWellnessStretchIntervalMs(wellness));
            nextAt = Math.min(nextAt, stretchAt);
        }

        return Math.max(REMINDER_MIN_DELAY_MS, Math.min(REMINDER_FALLBACK_POLL_MS, nextAt - now));
    }

    function scheduleReminderCheck(delayMs = null) {
        if (reminderCheckTimer) {
            clearTimeout(reminderCheckTimer);
        }
        const delay = Number.isFinite(delayMs) ? delayMs : getNextReminderDelay();
        reminderCheckTimer = setTimeout(() => {
            reminderCheckTimer = null;
            runReminderCheck();
        }, Math.max(REMINDER_MIN_DELAY_MS, delay));
    }

    function runReminderCheck() {
        ensureNotificationPermissionIfNeeded();

        const tasks = getTasks();
        const wellness = getWellnessSettings();
        const now = Date.now();
        let changed = false;
        let wellnessChanged = false;

        tasks.forEach(task => {
            if (!task.completed && !task.archived && task.reminderTime && !task.reminderSent) {
                const rTime = new Date(task.reminderTime).getTime();
                if (now >= rTime) {
                    sendTaskNotification(task);
                    task.reminderSent = true;
                    task.snoozedUntil = null;
                    changed = true;
                }
            }
        });

        if (wellness.waterEnabled) {
            if (!wellness.waterNextAt || !Number.isFinite(wellness.waterNextAt)) {
                wellness.waterNextAt = now + getWellnessWaterIntervalMs(wellness);
                wellnessChanged = true;
            } else if (now >= wellness.waterNextAt) {
                sendWellnessNotification('water');
                while (wellness.waterNextAt <= now) {
                    wellness.waterNextAt += getWellnessWaterIntervalMs(wellness);
                }
                wellnessChanged = true;
            }
        } else if (wellness.waterNextAt) {
            wellness.waterNextAt = 0;
            wellnessChanged = true;
        }

        if (wellness.stretchEnabled) {
            if (!wellness.stretchNextAt || !Number.isFinite(wellness.stretchNextAt)) {
                wellness.stretchNextAt = now + getWellnessStretchIntervalMs(wellness);
                wellnessChanged = true;
            } else if (now >= wellness.stretchNextAt) {
                sendWellnessNotification('stretch');
                while (wellness.stretchNextAt <= now) {
                    wellness.stretchNextAt += getWellnessStretchIntervalMs(wellness);
                }
                wellnessChanged = true;
            }
        } else if (wellness.stretchNextAt) {
            wellness.stretchNextAt = 0;
            wellnessChanged = true;
        }

        if (changed) {
            saveTasks(tasks);
            if (typeof renderTasksList === 'function') {
                renderTasksList();
            }
        }

        if (wellnessChanged) {
            saveWellnessSettings(wellness);
        }

        scheduleReminderCheck(getNextReminderDelay(now));
    }

    function initReminderChecker() {
        if (reminderCheckTimer) {
            clearTimeout(reminderCheckTimer);
            reminderCheckTimer = null;
        }
        ensureNotificationPermissionIfNeeded();
        runReminderCheck();
    }

    function sendTaskNotification(task) {
        const title = `🔔 Task Reminder: ${task.title}`;
        const body = task.description || `Priority: ${task.priority} | Project: ${task.project}`;
        const tag = `bm-task-${task.id}`;

        return sendAppNotification({
            title,
            body,
            tag,
            onClick: () => {
                window.focus();
                if (typeof togglePanel === 'function' && panel.style.display === 'none') {
                    togglePanel();
                }
                if (typeof switchTab === 'function') {
                    switchTab('todo');
                }
            }
        });
    }

    function sendTestTaskNotification() {
        return sendTaskNotification({
            id: 'test',
            title: 'Test Reminder',
            description: 'This is a test notification from PA.',
            priority: 'P2',
            project: 'Personal'
        });
    }

    function showWellnessSettingsModal() {
        closeSettingsDropdown();
        const existing = document.getElementById('bm-wellness-settings-modal');
        if (existing) existing.remove();

        const settings = getWellnessSettings();
        const modal = document.createElement('div');
        modal.id = 'bm-wellness-settings-modal';
        modal.className = 'bm-modal';
        modal.dataset.noAutoclose = '1';
        Object.assign(modal.style, {
            padding: '12px',
            minWidth: '300px',
            maxWidth: '340px',
            zIndex: '10002',
            textAlign: 'left'
        });

        const header = document.createElement('div');
        header.className = 'bm-header';
        header.textContent = 'Wellness Reminders';
        header.style.fontSize = '14px';
        header.style.marginBottom = '8px';

        const description = document.createElement('div');
        description.className = 'bm-text';
        description.textContent = 'Configure timing for water and stretch reminders. Enable or disable them from the Todo filter bar.';
        description.style.fontSize = '11px';
        description.style.color = '#666';
        description.style.marginBottom = '8px';
        description.style.lineHeight = '1.5';

        function createNumberRow(label, hint, value, min, max) {
            const wrapper = document.createElement('div');
            Object.assign(wrapper.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '8px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                marginBottom: '8px',
                background: '#fafafa'
            });

            const textWrap = document.createElement('div');
            textWrap.style.display = 'flex';
            textWrap.style.flexDirection = 'column';
            textWrap.style.gap = '2px';
            textWrap.style.flex = '1';

            const title = document.createElement('div');
            title.style.fontSize = '12px';
            title.style.fontWeight = 'bold';
            title.style.color = '#333';
            title.textContent = label;

            const sub = document.createElement('div');
            sub.style.fontSize = '10px';
            sub.style.color = '#777';
            sub.style.lineHeight = '1.4';
            sub.textContent = hint;

            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'bm-input';
            input.value = String(value);
            input.min = String(min);
            input.max = String(max);
            input.step = '1';
            input.style.width = '70px';
            input.style.fontSize = '12px';
            input.style.padding = '4px 6px';

            textWrap.append(title, sub);
            wrapper.append(textWrap, input);
            return { wrapper, input };
        }

        const waterIntervalRow = createNumberRow('💧 Water interval', 'Minutes between water reminders.', settings.waterIntervalMinutes, 5, 480);
        const workMinutesRow = createNumberRow('🧘 Work duration', 'Minutes of work before stretch reminder.', settings.workMinutes, 5, 480);
        const breakMinutesRow = createNumberRow('☕ Break duration', 'Suggested break/rest duration in minutes.', settings.breakMinutes, 1, 120);

        const testSection = document.createElement('div');
        Object.assign(testSection.style, {
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            padding: '8px',
            background: '#fafafa'
        });

        const testTitle = document.createElement('div');
        testTitle.className = 'bm-text';
        testTitle.textContent = 'Test notifications';
        testTitle.style.fontSize = '12px';
        testTitle.style.fontWeight = 'bold';
        testTitle.style.color = '#333';
        testTitle.style.marginBottom = '6px';

        const testHint = document.createElement('div');
        testHint.className = 'bm-text';
        testHint.textContent = 'Quickly verify task and wellness alerts.';
        testHint.style.fontSize = '10px';
        testHint.style.color = '#777';
        testHint.style.marginBottom = '8px';

        const testButtons = document.createElement('div');
        Object.assign(testButtons.style, {
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
            justifyContent: 'center'
        });

        const makeTestButton = (label, onClick) => {
            const btn = document.createElement('button');
            btn.className = 'bm-button';
            btn.textContent = label;
            btn.style.fontSize = '11px';
            btn.style.whiteSpace = 'nowrap';
            btn.addEventListener('click', onClick);
            return btn;
        };

        const testTaskBtn = makeTestButton('🔔 Task', () => {
            const sent = sendTestTaskNotification();
            if (sent) showFlash('Test task reminder sent', false, 'success');
        });

        const testWaterBtn = makeTestButton('💧 Water', () => {
            const sent = sendWellnessNotification('water');
            if (sent) showFlash('Test water reminder sent', false, 'success');
        });

        const testStretchBtn = makeTestButton('🧘 Stretch', () => {
            const sent = sendWellnessNotification('stretch');
            if (sent) showFlash('Test stretch reminder sent', false, 'success');
        });

        testButtons.append(testTaskBtn, testWaterBtn, testStretchBtn);
        testSection.append(testTitle, testHint, testButtons);

        const buttonsRow = document.createElement('div');
        Object.assign(buttonsRow.style, {
            display: 'flex',
            gap: '8px',
            marginTop: '10px',
            justifyContent: 'center'
        });

        const saveBtn = document.createElement('button');
        saveBtn.className = 'bm-button';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', () => {
            const nextSettings = getWellnessSettings();
            nextSettings.waterIntervalMinutes = clampWellnessMinutes(waterIntervalRow.input.value, settings.waterIntervalMinutes, 5, 480);
            nextSettings.workMinutes = clampWellnessMinutes(workMinutesRow.input.value, settings.workMinutes, 5, 480);
            nextSettings.breakMinutes = clampWellnessMinutes(breakMinutesRow.input.value, settings.breakMinutes, 1, 120);
            if (nextSettings.waterEnabled) nextSettings.waterNextAt = Date.now() + getWellnessWaterIntervalMs(nextSettings);
            if (nextSettings.stretchEnabled) nextSettings.stretchNextAt = Date.now() + getWellnessStretchIntervalMs(nextSettings);
            saveWellnessSettings(nextSettings);
            initReminderChecker();
            showFlash('Wellness timing updated', false, 'success');
            modal.remove();
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => modal.remove());

        buttonsRow.append(saveBtn, cancelBtn);
        modal.append(header, description, waterIntervalRow.wrapper, workMinutesRow.wrapper, breakMinutesRow.wrapper, testSection, buttonsRow);
        panel.appendChild(modal);
        wireModalIdleTracking(modal);
    }

    // --- Barcode Functions ---
    function makeBarcodeId() {
        return Date.now() + Math.floor(Math.random() * 1000000);
    }
    async function getBarcodes() {
        if (!barcodesCacheDirty && Array.isArray(barcodesCache)) return barcodesCache;
        let barcodes = gmGet(STORAGE_KEYS.BARCODES, []);
        if (!Array.isArray(barcodes)) barcodes = [];

        let changed = false;
        const seen = new Set();

        for (const b of barcodes) {
            if (!b || typeof b !== 'object') continue;
            const hasId = b.id !== undefined && b.id !== null;
            if (!hasId || seen.has(b.id)) {
                b.id = makeBarcodeId();
                changed = true;
            }
            seen.add(b.id);
        }

        if (changed) {
            gmSet(STORAGE_KEYS.BARCODES, barcodes);
        }
        setBarcodesCache(barcodes);
        return barcodesCache;
    }
    async function idbAddBarcode(barcode) {
        let barcodes = await getBarcodes();
        barcode.id = makeBarcodeId();
        barcodes.push(barcode);
        gmSet(STORAGE_KEYS.BARCODES, barcodes);
        setBarcodesCache(barcodes);
        return barcode.id;
    }
    async function idbGetBarcodesByFolder(folderName, subFolderName = null) {
        let barcodes = await getBarcodes();
        return barcodes.filter(b => {
            const folderMatch = (b.folder || '').toLowerCase() === folderName.toLowerCase();
            if (subFolderName !== null) {
                return folderMatch && (b.subfolder || '').toLowerCase() === subFolderName.toLowerCase();
            }
            return folderMatch;
        });
    }
    async function idbUpdateBarcode(id, updates) {
        const targetId = String(id);
        let barcodes = await getBarcodes();
        barcodes = barcodes.map(b => String(b.id) === targetId ? { ...b, ...updates } : b);
        gmSet(STORAGE_KEYS.BARCODES, barcodes);
        setBarcodesCache(barcodes);
    }
    async function idbDeleteBarcode(id) {
        const targetId = String(id);
        let barcodes = await getBarcodes();
        barcodes = barcodes.filter(b => String(b.id) !== targetId);
        gmSet(STORAGE_KEYS.BARCODES, barcodes);
        setBarcodesCache(barcodes);
    }

    async function deleteBarcodesByIds(ids) {
        const idSet = new Set((ids || []).map(id => String(id)));
        let barcodes = await getBarcodes();
        barcodes = barcodes.filter(b => !idSet.has(String(b.id)));
        gmSet(STORAGE_KEYS.BARCODES, barcodes);
        setBarcodesCache(barcodes);
    }

    async function moveBarcodesToFolder(ids, folder, subfolder) {
        const idSet = new Set((ids || []).map(id => String(id)));
        let barcodes = await getBarcodes();
        barcodes = barcodes.map(b => idSet.has(String(b.id))
            ? { ...b, folder: folder || 'Default', subfolder: subfolder || '' }
            : b);
        gmSet(STORAGE_KEYS.BARCODES, barcodes);
        setBarcodesCache(barcodes);
    }

    async function updateFolderBarcodesFormat(folderName, targetFormat, subFolderName = null) {
        const folderKey = String(folderName || '').toLowerCase();
        const subKey = subFolderName === null ? null : String(subFolderName || '').toLowerCase();
        let barcodes = await getBarcodes();
        barcodes = barcodes.map(b => {
            const inFolder = String(b?.folder || '').toLowerCase() === folderKey;
            const inSub = subKey === null ? true : String(b?.subfolder || '').toLowerCase() === subKey;
            if (!inFolder || !inSub) return b;
            if (String(b?.format || '').toUpperCase() === 'TEXT') return b;
            return { ...b, format: targetFormat };
        });
        gmSet(STORAGE_KEYS.BARCODES, barcodes);
        setBarcodesCache(barcodes);
    }

    function safeAppend(parent, child) {
        if (parent && child && !parent.contains(child)) {
            parent.appendChild(child);
        }
    }

    function showFlash(message, isError = false, type = 'info') {
        if (!window._barcodeFlash) return;
        window._barcodeFlashActive = true;
        window._barcodeFlash.textContent = message;
        window._barcodeFlash.className = `bm-flash ${isError ? 'error' : 'success'}`;
        window._barcodeFlash.style.display = 'flex';
        window._barcodeFlash.style.alignItems = 'center';
        window._barcodeFlash.style.justifyContent = 'center';
        window._barcodeFlash.style.height = '20px';
        window._barcodeFlash.style.lineHeight = '20px';
        window._barcodeFlash.style.padding = '0 4px';
        window._barcodeFlash.style.margin = '0';
        window._barcodeFlash.style.boxSizing = 'border-box';
        setTimeout(() => {
            window._barcodeFlash.style.display = 'none';
            formWrapper.innerHTML = '';
            window._barcodeFlashActive = false;
            renderFooterQuoteIfAllowed();
        }, 3000);
    }

    // Use Quotable's API as the only quote source; no hardcoded quote text.
    // Firefox/Tampermonkey can fail the HTTPS certificate chain for api.quotable.io
    // on some machines, while the same API endpoint works over HTTP.
    const FOOTER_QUOTE_SOURCE_URLS = [
        'https://api.quotable.io/random?minLength=25&maxLength=180',
        'http://api.quotable.io/random?minLength=25&maxLength=180'
    ];
    const FOOTER_QUOTE_INTERVAL_MS = 30 * 60 * 1000;
    const FOOTER_QUOTE_API_RETRY_MAX = 3;
    const FOOTER_QUOTE_HISTORY_MAX = 12;
    let footerRecentQuotes = [];
    let footerQuoteTimer = null;
    let footerQuoteText = '';
    let footerQuoteTitle = '';
    let footerQuoteLastFetchedAt = 0;
    let footerQuotePool = [];

    function isFooterSystemMessageActive() {
        return !!(typeof footerCenter !== 'undefined' && footerCenter && footerCenter.dataset && footerCenter.dataset.bmSystemMessage === '1');
    }

    function renderFooterQuoteIfAllowed() {
        if (typeof footerCenter === 'undefined' || !footerCenter) return;
        if (!footerQuoteText) return;
        if (window._barcodeFlashActive) return;
        if (isFooterSystemMessageActive()) return;
        footerCenter.textContent = footerQuoteText;
        footerCenter.title = footerQuoteTitle || footerQuoteText;
        footerCenter.className = 'bm-footer-quote';
        footerCenter.style.display = 'flex';
        footerCenter.style.fontStyle = 'italic';
        footerCenter.style.color = '#4a5568';
        footerCenter.style.cursor = 'pointer';
    }

    function formatFooterQuoteDisplay(quote) {
        if (!quote || !quote.content) return '';
        return quote.author ? `“${quote.content}” — ${quote.author}` : `“${quote.content}”`;
    }

    function chooseDifferentFooterQuote() {
        const pool = Array.isArray(footerQuotePool) ? footerQuotePool : [];

        if (!pool.length) return null;

        // Exclude recently shown quotes; fall back gracefully if pool is small
        const recentSet = new Set(footerRecentQuotes);
        let candidates = pool.filter((quote) => !recentSet.has(formatFooterQuoteDisplay(quote)));
        if (candidates.length === 0) {
            // All quotes exhausted — exclude only the very last shown
            const last = footerRecentQuotes[footerRecentQuotes.length - 1] || '';
            candidates = pool.filter((quote) => formatFooterQuoteDisplay(quote) !== last);
        }
        if (candidates.length === 0) candidates = pool.slice();
        return candidates[Math.floor(Math.random() * candidates.length)] || candidates[0] || null;
    }

    function applyFooterQuoteNow(quote, reschedule = true) {
        if (!quote || !quote.content) return false;
        footerQuoteText = formatFooterQuoteDisplay(quote);
        footerQuoteTitle = footerQuoteText;
        footerQuoteLastFetchedAt = Date.now();
        if (!footerQuotePool.some((item) => formatFooterQuoteDisplay(item) === footerQuoteText)) {
            footerQuotePool.push({ content: quote.content, author: quote.author || '' });
        }
        footerRecentQuotes.push(footerQuoteText);
        if (footerRecentQuotes.length > FOOTER_QUOTE_HISTORY_MAX) {
            footerRecentQuotes = footerRecentQuotes.slice(-FOOTER_QUOTE_HISTORY_MAX);
        }
        renderFooterQuoteIfAllowed();
        if (reschedule) {
            scheduleFooterQuoteRefresh();
        }
        return true;
    }

    function clearFooterQuoteTimer() {
        if (footerQuoteTimer) {
            clearTimeout(footerQuoteTimer);
            footerQuoteTimer = null;
        }
    }

    function scheduleFooterQuoteRefresh(delayMs = FOOTER_QUOTE_INTERVAL_MS) {
        clearFooterQuoteTimer();
        footerQuoteTimer = setTimeout(() => {
            footerQuoteTimer = null;
            fetchFooterQuote(true);
        }, Math.max(1000, delayMs));
    }

    function fetchFooterQuote(force = false, attempt = 0, sourceIndex = 0) {
        const now = Date.now();
        if (!force && footerQuoteText && (now - footerQuoteLastFetchedAt) < FOOTER_QUOTE_INTERVAL_MS) {
            renderFooterQuoteIfAllowed();
            scheduleFooterQuoteRefresh(FOOTER_QUOTE_INTERVAL_MS - (now - footerQuoteLastFetchedAt));
            return;
        }

        const normalizeQuotePayload = (quote) => {
            const content = String((quote && (quote.text || quote.content)) || '').replace(/\s+/g, ' ').trim();
            const author = String((quote && quote.author) || '').replace(/\s+/g, ' ').trim();
            if (!content) return null;
            return { content, author };
        };

        const failGracefully = () => {
            if (sourceIndex < FOOTER_QUOTE_SOURCE_URLS.length - 1) {
                fetchFooterQuote(true, attempt, sourceIndex + 1);
                return;
            }
            const cachedQuote = force ? chooseDifferentFooterQuote() : null;
            if (cachedQuote) {
                applyFooterQuoteNow(cachedQuote, true);
                return;
            }
            renderFooterQuoteIfAllowed();
            scheduleFooterQuoteRefresh();
        };

        const handleQuoteSource = (payload) => {
            const raw = Array.isArray(payload) ? payload
                : (payload && Array.isArray(payload.results)) ? payload.results
                    : [payload];
            const quote = raw.map(normalizeQuotePayload).find(Boolean);
            if (!quote) {
                failGracefully();
                return;
            }
            const displayText = formatFooterQuoteDisplay(quote);
            if (footerRecentQuotes.includes(displayText) && attempt < FOOTER_QUOTE_API_RETRY_MAX) {
                fetchFooterQuote(true, attempt + 1, sourceIndex);
                return;
            }
            applyFooterQuoteNow(quote, true);
        };

        const sourceUrl = FOOTER_QUOTE_SOURCE_URLS[sourceIndex] || FOOTER_QUOTE_SOURCE_URLS[0];
        const requestUrl = `${sourceUrl}&_=${Date.now()}-${attempt}`;

        if (typeof GM_xmlhttpRequest === 'function') {
            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: requestUrl,
                    timeout: 12000,
                    onload: (response) => {
                        try {
                            if (!response || response.status < 200 || response.status >= 300) {
                                failGracefully();
                                return;
                            }
                            const data = JSON.parse(response.responseText || '[]');
                            handleQuoteSource(data);
                        } catch {
                            failGracefully();
                        }
                    },
                    onerror: failGracefully,
                    ontimeout: failGracefully
                });
                return;
            } catch { }
        }

        if (typeof fetch === 'function') {
            fetch(requestUrl)
                .then((res) => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
                .then(handleQuoteSource)
                .catch(failGracefully);
            return;
        }

        failGracefully();
    }

    function normalizeBarcodeFormatInput(format) {
        const fmt = String(format || '').trim().toUpperCase();
        if (!fmt) return 'CODE128';
        if (fmt === '2D') return 'QR';
        if (['B00', 'LPN', 'X00'].includes(fmt)) return 'CODE128';
        return fmt;
    }

    const SMART_NAME_MAX_LEN = 30;

    function isLikelyUrlValue(val) {
        return /^https?:\/\//i.test(val) ||
            /^www\.[\w\-]+\.[a-z]{2,}/i.test(val) ||
            /^[\w\-]+\.[a-z]{2,}(\/.*)?$/i.test(val);
    }

    function ellipsizeText(text, maxLen = SMART_NAME_MAX_LEN) {
        const str = String(text || '').trim();
        if (!str) return '';
        if (str.length <= maxLen) return str;
        if (maxLen <= 1) return str.slice(0, 1);
        return `${str.slice(0, maxLen - 1)}…`;
    }

    function buildSmartBaseName(value, format) {
        const fmt = normalizeBarcodeFormatInput(format);
        const rawValue = String(value || '').trim();
        if (!rawValue) return fmt || 'CODE128';

        if (fmt === 'TEXT') {
            const firstLine = rawValue.split(/\r?\n/)[0] || 'Text Label';
            return `TEXT: ${firstLine.trim() || 'Text Label'}`;
        }

        if (fmt === 'QR' || fmt === '2D') {
            if (isLikelyUrlValue(rawValue)) {
                try {
                    const url = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;
                    const parsed = new URL(url);
                    const host = parsed.hostname || rawValue;
                    const path = (parsed.pathname || '').replace(/\/+$/, '');
                    const shortPath = path && path !== '/' ? path : '';
                    const valuePart = shortPath ? `${host}${shortPath}` : host;
                    return `QR: ${valuePart}`;
                } catch {
                    return `QR: ${rawValue}`;
                }
            }
            return `QR: ${rawValue}`;
        }

        return `${fmt}: ${rawValue}`;
    }

    function makeUniqueName(base, existingSet, maxLen = SMART_NAME_MAX_LEN) {
        const safeBase = ellipsizeText(base, maxLen) || 'Barcode';
        const normalized = (val) => String(val || '').trim().toLowerCase();
        if (!existingSet.has(normalized(safeBase))) return safeBase;
        let i = 2;
        while (i < 1000) {
            const suffix = ` (${i})`;
            const trimmedBase = ellipsizeText(safeBase, Math.max(1, maxLen - suffix.length));
            const candidate = `${trimmedBase}${suffix}`;
            if (!existingSet.has(normalized(candidate))) return candidate;
            i++;
        }
        return safeBase;
    }

    async function generateSmartBarcodeName(value, format, folder) {
        const base = buildSmartBaseName(value, format);
        const normalizedFolder = String(folder || 'Default');
        const barcodes = await idbGetBarcodesByFolder(normalizedFolder);
        const existing = new Set(
            (barcodes || []).map(b => String(b?.name || '').trim().toLowerCase()).filter(Boolean)
        );
        return makeUniqueName(base, existing, SMART_NAME_MAX_LEN);
    }

    function detectDelimiter(line) {
        const candidates = [',', ';', '\t', '|'];
        let best = ',';
        let bestCount = -1;
        for (const d of candidates) {
            let count = 0;
            for (let i = 0; i < line.length; i++) {
                if (line[i] === d) count++;
            }
            if (count > bestCount) {
                bestCount = count;
                best = d === '\t' ? '\t' : d;
            }
        }
        return best === '\t' ? '\t' : best;
    }

    function parseDelimitedLine(line, delimiter) {
        const out = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }
            if (!inQuotes && ch === delimiter) {
                out.push(cur);
                cur = '';
                continue;
            }
            cur += ch;
        }
        out.push(cur);
        return out.map(v => String(v ?? '').trim());
    }

    function parseCsvText(text) {
        const cleaned = String(text ?? '').replace(/\r/g, '').trim();
        if (!cleaned) return [];
        const lines = cleaned.split('\n').filter(l => l.trim() !== '');
        if (lines.length === 0) return [];
        const delimiter = detectDelimiter(lines[0]);
        const rows = lines.map(line => parseDelimitedLine(line, delimiter));

        const knownHeaders = ['name', 'value', 'format', 'folder', 'pinned'];
        const headerRow = rows[0].map(h => String(h || '').toLowerCase());
        const hasHeader = headerRow.some(h => knownHeaders.includes(h));

        const headerMap = {};
        if (hasHeader) {
            headerRow.forEach((h, idx) => {
                if (knownHeaders.includes(h)) headerMap[h] = idx;
            });
        } else {
            headerMap.value = 0;
            headerMap.name = 1;
            headerMap.format = 2;
            headerMap.folder = 3;
            headerMap.pinned = 4;
        }

        const start = hasHeader ? 1 : 0;
        const items = [];
        for (let i = start; i < rows.length; i++) {
            const row = rows[i];
            const get = (key) => (headerMap[key] != null ? row[headerMap[key]] : '');
            const value = String(get('value') ?? '').trim();
            if (!value) continue;
            items.push({
                name: String(get('name') ?? '').trim(),
                value,
                format: String(get('format') ?? '').trim(),
                folder: String(get('folder') ?? '').trim(),
                pinned: String(get('pinned') ?? '').trim()
            });
        }
        return items;
    }

    function parseTxtText(text) {
        return String(text ?? '')
            .replace(/\r/g, '')
            .split('\n')
            .map(v => String(v ?? '').trim())
            .filter(v => v !== '');
    }

    async function mergeImportData(incomingFolders, incomingBarcodes, incomingSubFolders = [], options = {}) {
        const normalize = (val) => String(val ?? '').trim().toLowerCase();
        const [existingFolders, existingBarcodes] = await Promise.all([getFolders(), getBarcodes()]);

        const mergedFolders = Array.isArray(existingFolders) ? [...existingFolders] : [];
        const mergedBarcodes = Array.isArray(existingBarcodes) ? [...existingBarcodes] : [];

        const folderMap = new Map(
            mergedFolders.map(f => [normalize(f?.name), f])
        );

        let addedFolders = 0;
        let addedBarcodes = 0;

        (Array.isArray(incomingFolders) ? incomingFolders : []).forEach(folder => {
            const name = normalize(folder?.name);
            if (!name) return;
            const existingFolder = folderMap.get(name);
            if (!existingFolder) {
                const newFolder = {
                    name: folder.name,
                    pinned: !!folder.pinned
                };
                mergedFolders.push(newFolder);
                folderMap.set(name, newFolder);
                addedFolders++;
            } else if (folder?.pinned && !existingFolder.pinned) {
                existingFolder.pinned = true;
            }
        });

        // Merge sub-folders
        const existingSubFolders = getAllSubFolders();
        const mergedSubFolders = [...existingSubFolders];
        const subFolderMap = new Map();
        mergedSubFolders.forEach((sf, idx) => {
            const key = `${normalize(sf?.parent)}|${normalize(sf?.name)}`;
            if (!subFolderMap.has(key)) subFolderMap.set(key, idx);
        });
        if (Array.isArray(incomingSubFolders)) {
            incomingSubFolders.forEach(sf => {
                const key = `${normalize(sf?.parent)}|${normalize(sf?.name)}`;
                if (!sf?.parent || !sf?.name) return;
                const existingIdx = subFolderMap.get(key);
                if (existingIdx == null) {
                    mergedSubFolders.push({ name: sf.name, parent: sf.parent, pinned: !!sf.pinned });
                    subFolderMap.set(key, mergedSubFolders.length - 1);
                } else if (sf?.pinned && !mergedSubFolders[existingIdx]?.pinned) {
                    mergedSubFolders[existingIdx] = { ...mergedSubFolders[existingIdx], pinned: true };
                }
            });
        }

        const barcodeKey = (b) => [
            normalize(b?.name),
            normalize(b?.value),
            normalize(b?.format),
            normalize(b?.folder)
        ].join('|');

        const barcodeIndexByKey = new Map();
        mergedBarcodes.forEach((barcode, idx) => {
            const key = barcodeKey(barcode);
            if (!barcodeIndexByKey.has(key)) barcodeIndexByKey.set(key, idx);
        });

        const makeId = () => Date.now() + Math.floor(Math.random() * 100000);

        (Array.isArray(incomingBarcodes) ? incomingBarcodes : []).forEach(b => {
            const key = barcodeKey(b);
            const existingIdx = barcodeIndexByKey.get(key);
            if (existingIdx != null) {
                if (b?.pinned && !mergedBarcodes[existingIdx]?.pinned) {
                    mergedBarcodes[existingIdx] = { ...mergedBarcodes[existingIdx], pinned: true };
                }
                return;
            }

            const folderName = normalize(b?.folder);
            if (folderName && !folderMap.has(folderName)) {
                const newFolder = { name: b.folder, pinned: false };
                mergedFolders.push(newFolder);
                folderMap.set(folderName, newFolder);
                addedFolders++;
            }

            const newBarcode = {
                id: makeId(),
                name: b?.name || '',
                value: b?.value || '',
                format: b?.format || 'CODE128',
                folder: b?.folder || 'Default',
                subfolder: b?.subfolder || '',
                pinned: !!b?.pinned
            };
            mergedBarcodes.push(newBarcode);
            barcodeIndexByKey.set(key, mergedBarcodes.length - 1);
            addedBarcodes++;
        });

        gmSet(STORAGE_KEYS.FOLDERS, mergedFolders);
        gmSet(STORAGE_KEYS.BARCODES, mergedBarcodes);
        gmSet(STORAGE_KEYS.SUBFOLDERS, mergedSubFolders);
        setFoldersCache(mergedFolders);
        setBarcodesCache(mergedBarcodes);
        activeFolder = null;
        activeSubFolder = null;
        renderFolders();
        if (!options.silent) {
            showFlash(`Import complete: +${addedFolders} folders, +${addedBarcodes} barcodes`, false, 'success');
        }
        return { addedFolders, addedBarcodes };
    }

    function mergeBookmarkImportData(incomingFolders = [], incomingBookmarks = [], incomingSubFolders = []) {
        const normalize = (val) => String(val ?? '').trim().toLowerCase();
        const mergedFolders = [...getBookmarkFolders()];
        const folderMap = new Map(mergedFolders.map(f => [normalize(f?.name), f]));
        let addedBookmarkFolders = 0;

        (Array.isArray(incomingFolders) ? incomingFolders : []).forEach(folder => {
            const name = String(folder?.name || '').trim();
            const key = normalize(name);
            if (!name) return;
            const existingFolder = folderMap.get(key);
            if (existingFolder) {
                if (folder?.pinned && !existingFolder.pinned) existingFolder.pinned = true;
                return;
            }
            const newFolder = { name, pinned: !!folder.pinned };
            mergedFolders.push(newFolder);
            folderMap.set(key, newFolder);
            addedBookmarkFolders++;
        });

        const mergedSubFolders = [...getAllBookmarkSubFolders()];
        const subFolderMap = new Map();
        mergedSubFolders.forEach((sf, idx) => {
            const key = `${normalize(sf?.parent)}|${normalize(sf?.name)}`;
            if (!subFolderMap.has(key)) subFolderMap.set(key, idx);
        });
        let addedBookmarkSubFolders = 0;

        (Array.isArray(incomingSubFolders) ? incomingSubFolders : []).forEach(sf => {
            const parent = String(sf?.parent || '').trim();
            const name = String(sf?.name || '').trim();
            const key = `${normalize(parent)}|${normalize(name)}`;
            if (!parent || !name) return;
            if (!folderMap.has(normalize(parent))) {
                const newFolder = { name: parent, pinned: false };
                mergedFolders.push(newFolder);
                folderMap.set(normalize(parent), newFolder);
                addedBookmarkFolders++;
            }
            const existingIdx = subFolderMap.get(key);
            if (existingIdx == null) {
                mergedSubFolders.push({ parent, name, pinned: !!sf.pinned });
                subFolderMap.set(key, mergedSubFolders.length - 1);
                addedBookmarkSubFolders++;
            } else if (sf?.pinned && !mergedSubFolders[existingIdx]?.pinned) {
                mergedSubFolders[existingIdx] = { ...mergedSubFolders[existingIdx], pinned: true };
            }
        });

        const mergedBookmarks = [...getBookmarks()];
        const bookmarkKey = (bookmark) => [
            normalize(bookmark?.name),
            normalize(bookmark?.url),
            normalize(bookmark?.folder),
            normalize(bookmark?.subfolder)
        ].join('|');
        const bookmarkIndexByKey = new Map();
        mergedBookmarks.forEach((bookmark, idx) => {
            const key = bookmarkKey(bookmark);
            if (!bookmarkIndexByKey.has(key)) bookmarkIndexByKey.set(key, idx);
        });
        let addedBookmarks = 0;

        (Array.isArray(incomingBookmarks) ? incomingBookmarks : []).forEach(bookmark => {
            const normalizedUrl = normalizeBookmarkUrl(bookmark?.url);
            if (!normalizedUrl) return;
            const folder = String(bookmark?.folder || '').trim();
            const subfolder = String(bookmark?.subfolder || '').trim();
            if (!folder) return;
            if (!folderMap.has(normalize(folder))) {
                const newFolder = { name: folder, pinned: false };
                mergedFolders.push(newFolder);
                folderMap.set(normalize(folder), newFolder);
                addedBookmarkFolders++;
            }
            if (subfolder) {
                const sfKey = `${normalize(folder)}|${normalize(subfolder)}`;
                const sfIdx = subFolderMap.get(sfKey);
                if (sfIdx == null) {
                    mergedSubFolders.push({ parent: folder, name: subfolder, pinned: false });
                    subFolderMap.set(sfKey, mergedSubFolders.length - 1);
                    addedBookmarkSubFolders++;
                }
            }
            const domain = getBookmarkDomain(normalizedUrl);
            const next = {
                id: bookmark?.id || `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
                name: String(bookmark?.name || domain || normalizedUrl).trim(),
                url: normalizedUrl,
                domain: bookmark?.domain || domain,
                folder,
                subfolder,
                favicon: bookmark?.favicon || getBookmarkFaviconUrl(normalizedUrl),
                pinned: !!bookmark?.pinned,
                createdAt: bookmark?.createdAt || Date.now(),
                updatedAt: bookmark?.updatedAt || Date.now()
            };
            const key = bookmarkKey(next);
            const existingIdx = bookmarkIndexByKey.get(key);
            if (existingIdx != null) {
                if (next.pinned && !mergedBookmarks[existingIdx]?.pinned) {
                    mergedBookmarks[existingIdx] = { ...mergedBookmarks[existingIdx], pinned: true, updatedAt: Date.now() };
                }
                return;
            }
            mergedBookmarks.push(next);
            bookmarkIndexByKey.set(key, mergedBookmarks.length - 1);
            addedBookmarks++;
        });

        saveBookmarkFolders(mergedFolders);
        saveBookmarkSubFolders(mergedSubFolders);
        saveBookmarks(mergedBookmarks);
        selectedBookmarkIds.clear();
        bookmarkActiveFolder = null;
        bookmarkActiveSubFolder = null;
        renderBookmarks();
        return { addedBookmarkFolders, addedBookmarkSubFolders, addedBookmarks };
    }

    function createBookmarkImportLocation(folderPath = []) {
        const cleanPath = (Array.isArray(folderPath) ? folderPath : [])
            .map(part => String(part || '').trim())
            .filter(Boolean);
        return {
            folder: cleanPath[0] || 'Imported Bookmarks',
            subfolder: cleanPath.length > 1 ? cleanPath.slice(1).join(' / ') : ''
        };
    }

    function parseBrowserBookmarksHtml(htmlText) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(String(htmlText || ''), 'text/html');
        const folders = new Map();
        const subfolders = new Map();
        const bookmarks = [];
        const addFolderLocation = (folderPath) => {
            const location = createBookmarkImportLocation(folderPath);
            if (!location.folder) return location;
            const folderKey = location.folder.toLowerCase();
            if (!folders.has(folderKey)) folders.set(folderKey, { name: location.folder, pinned: false });
            if (location.subfolder) {
                const subKey = `${location.folder.toLowerCase()}|${location.subfolder.toLowerCase()}`;
                if (!subfolders.has(subKey)) subfolders.set(subKey, { parent: location.folder, name: location.subfolder, pinned: false });
            }
            return location;
        };
        const getDirectChild = (element, tagName) => Array.from(element?.children || [])
            .find(child => child.tagName === tagName);
        const getNestedDlForFolder = (dt) => {
            const direct = getDirectChild(dt, 'DL');
            if (direct) return direct;
            let next = dt?.nextElementSibling || null;
            while (next) {
                if (next.tagName === 'DL') return next;
                if (next.tagName === 'DT') return null;
                next = next.nextElementSibling;
            }
            return null;
        };
        const walkDl = (dl, folderPath = []) => {
            if (!dl) return;
            Array.from(dl.children || []).forEach(child => {
                if (child.tagName !== 'DT') return;
                const h3 = getDirectChild(child, 'H3');
                if (h3) {
                    const folderName = String(h3.textContent || '').trim();
                    const nestedDl = getNestedDlForFolder(child);
                    if (folderName) walkDl(nestedDl, [...folderPath, folderName]);
                    return;
                }
                const link = getDirectChild(child, 'A');
                if (!link) return;
                const url = normalizeBookmarkUrl(link.getAttribute('href') || '');
                if (!url) return;
                const location = addFolderLocation(folderPath);
                const addDate = Number(link.getAttribute('add_date'));
                const createdAt = Number.isFinite(addDate) && addDate > 0 ? addDate * 1000 : Date.now();
                bookmarks.push({
                    name: String(link.textContent || getBookmarkDomain(url) || url).trim(),
                    url,
                    folder: location.folder,
                    subfolder: location.subfolder,
                    createdAt,
                    updatedAt: createdAt,
                    pinned: false
                });
            });
        };
        const rootDl = doc.querySelector('dl');
        walkDl(rootDl, []);
        return {
            bookmarkFolders: Array.from(folders.values()),
            bookmarkSubfolders: Array.from(subfolders.values()),
            bookmarks
        };
    }

    function isFirefoxBookmarksJson(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
        return Array.isArray(data.children)
            || data.root === 'placesRoot'
            || data.guid === 'root________'
            || data.type === 'text/x-moz-place-container'
            || data.typeCode === 2;
    }

    function normalizeFirefoxBookmarkTime(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return Date.now();
        // Firefox JSON backups store dateAdded/lastModified in microseconds.
        if (numeric > 100000000000000) return Math.round(numeric / 1000);
        return numeric;
    }

    function parseFirefoxBookmarksJson(data) {
        const folders = new Map();
        const subfolders = new Map();
        const bookmarks = [];
        const ignoredRootTitles = new Set([
            '',
            'root',
            'places',
            'bookmarks menu',
            'bookmarks toolbar',
            'other bookmarks',
            'mobile bookmarks',
            'tags'
        ]);
        const addFolderLocation = (folderPath) => {
            const location = createBookmarkImportLocation(folderPath);
            const folderKey = location.folder.toLowerCase();
            if (!folders.has(folderKey)) folders.set(folderKey, { name: location.folder, pinned: false });
            if (location.subfolder) {
                const subKey = `${location.folder.toLowerCase()}|${location.subfolder.toLowerCase()}`;
                if (!subfolders.has(subKey)) subfolders.set(subKey, { parent: location.folder, name: location.subfolder, pinned: false });
            }
            return location;
        };
        const walkNode = (node, folderPath = []) => {
            if (!node || typeof node !== 'object') return;
            const rawTitle = String(node.title || '').trim();
            const lowerTitle = rawTitle.toLowerCase();
            const isBookmark = !!node.uri || node.type === 'text/x-moz-place' || node.typeCode === 1;
            const isFolder = Array.isArray(node.children) || node.type === 'text/x-moz-place-container' || node.typeCode === 2;

            if (isBookmark && node.uri) {
                const url = normalizeBookmarkUrl(node.uri);
                if (!url) return;
                const location = addFolderLocation(folderPath);
                const createdAt = normalizeFirefoxBookmarkTime(node.dateAdded || node.lastModified);
                const updatedAt = normalizeFirefoxBookmarkTime(node.lastModified || node.dateAdded);
                bookmarks.push({
                    name: rawTitle || getBookmarkDomain(url) || url,
                    url,
                    folder: location.folder,
                    subfolder: location.subfolder,
                    createdAt,
                    updatedAt,
                    pinned: false
                });
                return;
            }

            if (isFolder) {
                const shouldKeepFolder = rawTitle && !ignoredRootTitles.has(lowerTitle);
                const nextPath = shouldKeepFolder ? [...folderPath, rawTitle] : folderPath;
                (node.children || []).forEach(child => walkNode(child, nextPath));
            }
        };
        walkNode(data, []);
        return {
            bookmarkFolders: Array.from(folders.values()),
            bookmarkSubfolders: Array.from(subfolders.values()),
            bookmarks
        };
    }

    function parseBookmarkImportFile(text, fileName = '') {
        const content = String(text || '').trim();
        const lowerName = String(fileName || '').toLowerCase();
        if (!content) return { bookmarkFolders: [], bookmarkSubfolders: [], bookmarks: [] };
        if (lowerName.endsWith('.json') || content.startsWith('{') || content.startsWith('[')) {
            const data = JSON.parse(content);
            if (Array.isArray(data)) {
                return { bookmarkFolders: [], bookmarkSubfolders: [], bookmarks: data };
            }
            if (isFirefoxBookmarksJson(data)) {
                return parseFirefoxBookmarksJson(data);
            }
        }
        return parseBrowserBookmarksHtml(content);
    }

    function showBookmarkImportFilePicker() {
        closeDropdown();
        switchTab('bookmarks');
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.html,.htm,.json,text/html,application/json';
        input.style.display = 'none';
        input.addEventListener('change', async () => {
            const file = input.files && input.files[0];
            input.remove();
            if (!file) return;
            try {
                const text = await file.text();
                const parsed = parseBookmarkImportFile(text, file.name);
                const result = mergeBookmarkImportData(parsed.bookmarkFolders, parsed.bookmarks, parsed.bookmarkSubfolders);
                showFlash(`Bookmark import complete: +${result.addedBookmarkFolders} folders, +${result.addedBookmarkSubFolders} sub-folders, +${result.addedBookmarks} bookmarks`, false, 'success');
            } catch (err) {
                WorkspaceDiagnostics.warn('Bookmark file import failed.', err);
                showFlash('Bookmark import failed. Use browser HTML or Firefox JSON.', true, 'error');
            }
        });
        document.body.appendChild(input);
        input.click();
    }

    function mergeTodoImportData(incomingTasks = [], incomingProjects = []) {
        const normalize = (val) => String(val ?? '').trim().toLowerCase();
        const mergedProjects = [...getTodoProjects()];
        const projectSet = new Set(mergedProjects.map(normalize));
        let addedTodoProjects = 0;

        (Array.isArray(incomingProjects) ? incomingProjects : []).forEach(project => {
            const name = String(project || '').trim();
            if (!name || projectSet.has(normalize(name))) return;
            mergedProjects.push(name);
            projectSet.add(normalize(name));
            addedTodoProjects++;
        });

        const mergedTasks = [...getTasks()];
        const taskKey = (task) => [
            String(task?.id || ''),
            normalize(task?.title),
            normalize(task?.project),
            String(task?.createdAt || '')
        ].join('|');
        const taskKeys = new Set(mergedTasks.map(taskKey));
        let addedTasks = 0;

        (Array.isArray(incomingTasks) ? incomingTasks : []).forEach(task => {
            if (!task || typeof task !== 'object') return;
            const title = String(task.title || '').trim();
            if (!title) return;
            const project = String(task.project || mergedProjects[0] || 'Personal').trim();
            if (project && !projectSet.has(normalize(project))) {
                mergedProjects.push(project);
                projectSet.add(normalize(project));
                addedTodoProjects++;
            }
            const next = {
                ...task,
                id: task.id || Date.now() + Math.floor(Math.random() * 1000),
                title,
                project: project || 'Personal'
            };
            const key = taskKey(next);
            if (taskKeys.has(key)) return;
            mergedTasks.push(next);
            taskKeys.add(key);
            addedTasks++;
        });

        saveTodoProjects(mergedProjects);
        saveTasks(mergedTasks);
        if (typeof renderTasksList === 'function') renderTasksList();
        return { addedTodoProjects, addedTasks };
    }

    function getOrCreateWorkspaceId() {
        let metadata = gmGet(STORAGE_KEYS.WORKSPACE_METADATA, {});
        if (!metadata || typeof metadata !== 'object') metadata = {};
        if (typeof metadata.workspaceId === 'string' && metadata.workspaceId.trim().length > 0) {
            return metadata.workspaceId;
        }
        const newId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            ? crypto.randomUUID()
            : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
        metadata.workspaceId = newId;
        gmSet(STORAGE_KEYS.WORKSPACE_METADATA, metadata);
        return newId;
    }

    function getOrCreateWorkspaceCreatedAt() {
        let metadata = gmGet(STORAGE_KEYS.WORKSPACE_METADATA, {});
        if (!metadata || typeof metadata !== 'object') metadata = {};
        if (typeof metadata.createdAt === 'string' && metadata.createdAt.trim().length > 0) {
            return metadata.createdAt;
        }
        const now = new Date().toISOString();
        metadata.createdAt = now;
        gmSet(STORAGE_KEYS.WORKSPACE_METADATA, metadata);
        return now;
    }

    function buildWorkspaceManifest(customMeta = {}) {
        const workspaceId = customMeta.workspaceId || getOrCreateWorkspaceId();
        const createdAt = customMeta.createdAt || getOrCreateWorkspaceCreatedAt();
        let name = customMeta.workspaceName;
        if (!name && typeof WorkspaceService !== 'undefined' && WorkspaceService.getState) {
            name = WorkspaceService.getState()?.selectedFolder;
        }
        if (!name) name = 'Default Workspace';

        return {
            format: "PA",
            formatVersion: "1.0",
            workspaceId: String(workspaceId),
            workspaceName: String(name),
            description: String(customMeta.description || ""),
            icon: String(customMeta.icon || "workspace"),
            color: String(customMeta.color || "#4CAF50"),
            createdBy: "PA " + SCRIPT_VERSION,
            createdAt: String(createdAt),
            lastModified: new Date().toISOString(),
            minimumSupportedVersion: "1.0"
        };
    }

    async function serializeWorkspaceData(data, customMeta = {}) {
        const zip = new JSZip();
        const manifest = buildWorkspaceManifest(customMeta);
        zip.file("manifest.json", JSON.stringify(manifest, null, 2));
        zip.file("workspace.json", JSON.stringify(data, null, 2));
        zip.folder("images");
        return await zip.generateAsync({ type: "arraybuffer" });
    }

    async function deserializeWorkspaceData(buffer) {
        let zip;
        try {
            zip = await JSZip.loadAsync(buffer);
        } catch (err) {
            throw new Error("This is not a valid PA Workspace.");
        }

        const manifestFile = zip.file("manifest.json");
        if (!manifestFile) throw new Error("Unable to read manifest.");

        let manifest;
        try {
            const manifestRaw = await manifestFile.async("text");
            manifest = JSON.parse(manifestRaw);
        } catch (err) {
            throw new Error("Unable to read manifest.");
        }

        if (!manifest || manifest.format !== "PA") {
            throw new Error("This is not a valid PA Workspace.");
        }

        const CURRENT_FORMAT_VERSION = 1.0;
        const rawVersion = manifest.formatVersion || manifest.version || "1.0";
        const fileVersion = parseFloat(rawVersion);
        if (isNaN(fileVersion)) {
            throw new Error("Workspace format is unsupported.");
        }
        if (fileVersion > CURRENT_FORMAT_VERSION) {
            throw new Error("This Workspace was created using a newer Workspace format.");
        }

        const workspaceFile = zip.file("workspace.json");
        if (!workspaceFile) throw new Error("Workspace is incomplete.");

        let workspaceData;
        try {
            const workspaceRaw = await workspaceFile.async("text");
            workspaceData = JSON.parse(workspaceRaw);
        } catch (err) {
            throw new Error("Workspace is corrupted.");
        }

        if (manifest.workspaceId) {
            let metadata = gmGet(STORAGE_KEYS.WORKSPACE_METADATA, {});
            if (!metadata || typeof metadata !== 'object') metadata = {};
            metadata.workspaceId = manifest.workspaceId;
            if (manifest.createdAt) metadata.createdAt = manifest.createdAt;
            gmSet(STORAGE_KEYS.WORKSPACE_METADATA, metadata);
        }

        return {
            manifest,
            data: workspaceData
        };
    }

    async function buildFullBackupData() {
        const folders = await getFolders();
        const barcodes = await getBarcodes();
        return {
            schema: 'PA-backup',
            schemaVersion: 2,
            exportedAt: new Date().toISOString(),
            folders,
            barcodes,
            subfolders: getAllSubFolders(),
            bookmarkFolders: getBookmarkFolders(),
            bookmarkSubfolders: getAllBookmarkSubFolders(),
            bookmarks: getBookmarks(),
            noteFolders: NoteService.getNoteFolders(),
            notes: NoteService.getNotes(),
            todoProjects: getTodoProjects(),
            tasks: getTasks(),
            wellnessSettings: getWellnessSettings(),
            printServerOverride: gmGet(PRINT_SERVER_OVERRIDE_KEY, ''),
            printLog: gmGet(PRINT_LOG_KEY, [])
        };
    }

    function getBackupUserDataCounts(data) {
        return {
            folders: Array.isArray(data?.folders) ? data.folders.length : 0,
            barcodes: Array.isArray(data?.barcodes) ? data.barcodes.length : 0,
            subfolders: Array.isArray(data?.subfolders) ? data.subfolders.length : 0,
            bookmarkFolders: Array.isArray(data?.bookmarkFolders) ? data.bookmarkFolders.length : 0,
            bookmarkSubfolders: Array.isArray(data?.bookmarkSubfolders) ? data.bookmarkSubfolders.length : 0,
            bookmarks: Array.isArray(data?.bookmarks) ? data.bookmarks.length : 0,
            noteFolders: Array.isArray(data?.noteFolders) ? data.noteFolders.length : 0,
            notes: Array.isArray(data?.notes) ? data.notes.length : 0,
            todoProjects: Array.isArray(data?.todoProjects) ? data.todoProjects.length : 0,
            tasks: Array.isArray(data?.tasks) ? data.tasks.length : 0,
            printLog: Array.isArray(data?.printLog) ? data.printLog.length : 0,
            hasWellnessSettings: !!data?.wellnessSettings,
            hasPrintServerOverride: typeof data?.printServerOverride === 'string' && data.printServerOverride.trim() !== ''
        };
    }

    function hasBackupUserData(data) {
        const counts = getBackupUserDataCounts(data);
        return counts.folders > 0
            || counts.barcodes > 0
            || counts.subfolders > 0
            || counts.bookmarkFolders > 0
            || counts.bookmarkSubfolders > 0
            || counts.bookmarks > 0
            || counts.noteFolders > 0
            || counts.notes > 0
            || counts.todoProjects > 0
            || counts.tasks > 0
            || counts.printLog > 0
            || counts.hasWellnessSettings
            || counts.hasPrintServerOverride;
    }

    function flattenDeepHierarchy(rootFolders, subfolders, items) {
        if (!Array.isArray(rootFolders) || !Array.isArray(subfolders)) return false;
        let modified = false;

        const rootSet = new Set(rootFolders.map(f => (typeof f === 'string' ? f : f.name).toLowerCase()));
        const sfMap = new Map();
        for (const sf of subfolders) {
            if (sf && sf.name && sf.parent) sfMap.set(sf.name.toLowerCase(), sf.parent.toLowerCase());
        }

        function getUltimateRoot(childName) {
            let current = (childName || '').toLowerCase();
            const seen = new Set();
            while (current && !rootSet.has(current)) {
                if (seen.has(current)) break;
                seen.add(current);
                const p = sfMap.get(current);
                if (!p) break;
                current = p;
            }
            return current;
        }

        function getOriginalNameOfParent(lowerRoot) {
            for (const f of rootFolders) {
                const name = typeof f === 'string' ? f : f.name;
                if (name && name.toLowerCase() === lowerRoot) return name;
            }
            return null;
        }

        for (const sf of subfolders) {
            if (!sf || !sf.parent) continue;
            const parentLower = sf.parent.toLowerCase();
            if (!rootSet.has(parentLower)) {
                const ultimateLower = getUltimateRoot(parentLower);
                if (ultimateLower !== parentLower && rootSet.has(ultimateLower)) {
                    const properRootName = getOriginalNameOfParent(ultimateLower);
                    if (properRootName) {
                        sf.parent = properRootName;
                        modified = true;
                    }
                }
            }
        }

        if (Array.isArray(items)) {
            for (const item of items) {
                if (item && item.folder && item.subfolder) {
                    const fLower = item.folder.toLowerCase();
                    if (!rootSet.has(fLower)) {
                        const ultimateLower = getUltimateRoot(fLower);
                        if (ultimateLower !== fLower && rootSet.has(ultimateLower)) {
                            const properRootName = getOriginalNameOfParent(ultimateLower);
                            if (properRootName) {
                                item.folder = properRootName;
                                modified = true;
                            }
                        }
                    }
                }
            }
        }

        return modified;
    }

    function normalizeBackupPayload(data) {
        const nestedBookmarks = data && typeof data.bookmarks === 'object' && !Array.isArray(data.bookmarks) ? data.bookmarks : null;
        const nestedTodo = data && typeof data.todo === 'object' ? data.todo : null;
        const nestedNotebook = data && typeof data.notebook === 'object' ? data.notebook : null;
        const nestedWellness = data && typeof data.wellness === 'object' ? data.wellness : null;

        const payload = {
            folders: Array.isArray(data?.folders) ? data.folders : [],
            barcodes: Array.isArray(data?.barcodes) ? data.barcodes : [],
            subfolders: Array.isArray(data?.subfolders) ? data.subfolders : [],
            bookmarkFolders: Array.isArray(data?.bookmarkFolders) ? data.bookmarkFolders : (Array.isArray(nestedBookmarks?.folders) ? nestedBookmarks.folders : []),
            bookmarkSubfolders: Array.isArray(data?.bookmarkSubfolders) ? data.bookmarkSubfolders : (Array.isArray(nestedBookmarks?.subfolders) ? nestedBookmarks.subfolders : []),
            bookmarks: Array.isArray(data?.bookmarks) ? data.bookmarks : (Array.isArray(nestedBookmarks?.items) ? nestedBookmarks.items : []),
            noteFolders: Array.isArray(data?.noteFolders) ? data.noteFolders : (Array.isArray(nestedNotebook?.folders) ? nestedNotebook.folders : []),
            notes: Array.isArray(data?.notes) ? data.notes : (Array.isArray(nestedNotebook?.notes) ? nestedNotebook.notes : []),
            todoProjects: Array.isArray(data?.todoProjects) ? data.todoProjects : (Array.isArray(nestedTodo?.projects) ? nestedTodo.projects : []),
            tasks: Array.isArray(data?.tasks) ? data.tasks : (Array.isArray(nestedTodo?.tasks) ? nestedTodo.tasks : []),
            wellnessSettings: data?.wellnessSettings || nestedWellness?.settings || null,
            printServerOverride: typeof data?.printServerOverride === 'string' ? data.printServerOverride : null,
            printLog: Array.isArray(data?.printLog) ? data.printLog : null
        };

        flattenDeepHierarchy(payload.folders, payload.subfolders, payload.barcodes);
        flattenDeepHierarchy(payload.bookmarkFolders, payload.bookmarkSubfolders, payload.bookmarks);

        return payload;
    }

    async function importBackupData(data) {
        const payload = normalizeBackupPayload(data || {});
        const barcodeCounts = await mergeImportData(payload.folders, payload.barcodes, payload.subfolders, { silent: true });
        const bookmarkCounts = mergeBookmarkImportData(payload.bookmarkFolders, payload.bookmarks, payload.bookmarkSubfolders);
        if (payload.noteFolders.length) {
            NoteService.saveNoteFolders([...NoteService.getNoteFolders(), ...payload.noteFolders]);
        }
        const noteCounts = NoteService.mergeNotes(payload.notes);
        const todoCounts = mergeTodoImportData(payload.tasks, payload.todoProjects);
        if (payload.wellnessSettings) saveWellnessSettings(payload.wellnessSettings);
        if (payload.printServerOverride !== null) gmSet(PRINT_SERVER_OVERRIDE_KEY, payload.printServerOverride);
        if (payload.printLog !== null) gmSet(PRINT_LOG_KEY, payload.printLog);
        await refreshPanelAfterDataMutation();
        showFlash(`Import complete: +${barcodeCounts.addedBarcodes} barcodes, +${bookmarkCounts.addedBookmarks} bookmarks, +${noteCounts.addedNotes} notes, +${todoCounts.addedTasks} tasks`, false, 'success');
    }

    // ============================================================
    // SECTION: Print Pipeline - Configuration, Logs, ZPL, Bridge
    // ------------------------------------------------------------
    // Printer behavior is intentionally kept in-place. Do not split
    // or reorder this block without printer access and regression
    // tests for Printmon HTTP and the local ZPL bridge.
    // ============================================================

    const PRINT_SERVER_OVERRIDE_KEY = STORAGE_KEYS.PRINT_SERVER_OVERRIDE;
    const DEFAULT_PRINT_HOST = 'localhost';
    const DEFAULT_PRINT_PORT = '5965';
    const PRINT_LOG_KEY = STORAGE_KEYS.PRINT_LOG;
    const PRINT_LOG_MAX = 25;
    let PRINT_LOG = null;

    // === PRINT LOG BLOCK (remove this block to disable logging) START ===
    const ENABLE_PRINT_LOG = true;

    function buildDefaultPrintServer(host = DEFAULT_PRINT_HOST, port = DEFAULT_PRINT_PORT) {
        const safeHost = String(host || DEFAULT_PRINT_HOST).trim() || DEFAULT_PRINT_HOST;
        const safePort = /^\d{1,5}$/.test(String(port || '').trim()) ? String(port).trim() : DEFAULT_PRINT_PORT;
        return `http://${safeHost}:${safePort}`;
    }

    function initPrintLog() {
        if (!ENABLE_PRINT_LOG) return;

        const read = () => {
            const log = gmGet(PRINT_LOG_KEY, []);
            return Array.isArray(log) ? log : [];
        };

        const write = (entries) => {
            const safe = Array.isArray(entries) ? entries.slice(0, PRINT_LOG_MAX) : [];
            gmSet(PRINT_LOG_KEY, safe);
        };

        const add = (entry) => {
            const list = read();
            list.unshift(entry);
            write(list);
            return entry?.id;
        };

        const update = (id, updates = {}) => {
            const list = read();
            const idx = list.findIndex(item => item?.id === id);
            if (idx < 0) return;
            list[idx] = { ...list[idx], ...updates };
            write(list);
        };

        const showModal = () => {
            closeSettingsDropdown();
            const existing = document.getElementById('bm-print-log-modal');
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.id = 'bm-print-log-modal';
            modal.className = 'bm-modal';
            modal.dataset.noAutoclose = '1';
            Object.assign(modal.style, {
                padding: '12px',
                minWidth: '300px',
                maxWidth: '420px',
                textAlign: 'left',
                zIndex: '10002'
            });

            const header = document.createElement('div');
            header.className = 'bm-header';
            header.textContent = 'Print Log';
            header.style.fontSize = '14px';
            header.style.marginBottom = '6px';

            const hint = document.createElement('div');
            hint.className = 'bm-text';
            hint.textContent = 'Latest print requests and responses.';
            hint.style.fontSize = '11px';
            hint.style.color = '#666';
            hint.style.marginBottom = '8px';

            const list = document.createElement('div');
            list.className = 'bm-modal-scroll';
            Object.assign(list.style, {
                maxHeight: '220px',
                overflow: 'auto',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                padding: '6px',
                background: '#fafafa'
            });
            list.style.userSelect = 'text';

            const entries = read();
            if (!entries.length) {
                const empty = document.createElement('div');
                empty.className = 'bm-text';
                empty.textContent = 'No print activity yet.';
                empty.style.fontSize = '12px';
                empty.style.color = '#777';
                list.appendChild(empty);
            } else {
                entries.forEach((item) => {
                    const row = document.createElement('div');
                    row.style.padding = '6px';
                    row.style.borderBottom = '1px dashed #ddd';

                    const top = document.createElement('div');
                    top.className = 'bm-text';
                    top.style.fontSize = '12px';
                    top.style.fontWeight = 'bold';
                    top.textContent = `${item.time || ''} • ${item.type || ''}${item.format ? ` (${item.format})` : ''}`;

                    const status = document.createElement('div');
                    status.className = 'bm-text';
                    status.style.fontSize = '11px';
                    status.style.color = item.success ? '#2e7d32' : '#c62828';
                    const http = item.httpStatus != null ? `HTTP ${item.httpStatus}` : 'No response';
                    status.textContent = `${item.success ? 'OK' : 'FAIL'} • ${http}`;

                    const body = document.createElement('div');
                    body.className = 'bm-text';
                    body.style.fontSize = '11px';
                    body.style.color = '#555';
                    const bodyText = item.body ? String(item.body).slice(0, 80) : '';
                    body.textContent = bodyText ? `Response: ${bodyText}` : 'Response: (empty)';

                    const meta = document.createElement('div');
                    meta.className = 'bm-text';
                    meta.style.fontSize = '10px';
                    meta.style.color = '#666';
                    meta.textContent = `server: ${item.server || ''}${item.override ? ` | override: ${item.override}` : ''}`;

                    const sizes = document.createElement('div');
                    sizes.className = 'bm-text';
                    sizes.style.fontSize = '10px';
                    sizes.style.color = '#666';
                    sizes.textContent = `lens: data ${item.dataLen || 0}, text ${item.textLen || 0}, desc ${item.descLen || 0}`;

                    const url = document.createElement('div');
                    url.className = 'bm-text';
                    url.style.fontSize = '10px';
                    url.style.color = '#888';
                    const urlText = item.url ? String(item.url) : '';
                    url.textContent = urlText ? `URL: ${urlText}` : '';

                    row.append(top, status, body, meta, sizes);
                    if (urlText) row.append(url);
                    list.appendChild(row);
                });
            }

            const buttonsRow = document.createElement('div');
            Object.assign(buttonsRow.style, {
                display: 'flex',
                gap: '8px',
                marginTop: '10px',
                justifyContent: 'center'
            });

            const copyBtn = document.createElement('button');
            copyBtn.className = 'bm-button';
            copyBtn.textContent = 'Copy Log';
            copyBtn.addEventListener('click', () => {
                const lines = read().map((item) => {
                    const headerLine = `${item.time || ''} | ${item.type || ''}${item.format ? ` (${item.format})` : ''} | qty: ${item.quantity ?? ''}`;
                    const statusLine = `${item.success ? 'OK' : 'FAIL'} | HTTP: ${item.httpStatus != null ? item.httpStatus : 'n/a'}${item.error ? ` | err: ${item.error}` : ''}`;
                    const serverLine = `server: ${item.server || ''}${item.override ? ` | override: ${item.override}` : ''}`;
                    const sizeLine = `lens: data ${item.dataLen || 0}, text ${item.textLen || 0}, desc ${item.descLen || 0}`;
                    const badgeLine = item.badgeId ? `badgeId: ${item.badgeId}` : '';
                    const dimLine = (item.width || item.height || item.lines || item.cols)
                        ? `dims: w ${item.width || ''} h ${item.height || ''} lines ${item.lines || ''} cols ${item.cols || ''}`
                        : '';
                    const bodyLine = `Response: ${item.body ? String(item.body) : ''}`;
                    const urlLine = item.url ? `URL: ${item.url}` : '';
                    return [headerLine, statusLine, serverLine, sizeLine, badgeLine, dimLine, bodyLine, urlLine]
                        .filter(Boolean)
                        .join('\n');
                });
                if (!lines.length) {
                    showFlash('Log is empty', true, 'error');
                    return;
                }
                copyToClipboard(lines.join('\n\n'));
            });

            const clearBtn = document.createElement('button');
            clearBtn.className = 'bm-button';
            clearBtn.textContent = 'Clear Log';
            clearBtn.addEventListener('click', () => {
                write([]);
                modal.remove();
            });

            const closeBtn = document.createElement('button');
            closeBtn.className = 'bm-button';
            closeBtn.textContent = 'Close';
            closeBtn.addEventListener('click', () => modal.remove());

            buttonsRow.append(copyBtn, clearBtn, closeBtn);
            modal.append(header, hint, list, buttonsRow);
            panel.appendChild(modal);
            wireModalIdleTracking(modal);

            modal.tabIndex = -1;
            modal.focus();
            modal.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    modal.remove();
                }
            });
        };

        PRINT_LOG = { enabled: true, read, write, add, update, showModal };
    }

    initPrintLog();
    // === PRINT LOG BLOCK (remove this block to disable logging) END ===

    function getPrintServerOverride() {
        const raw = gmGet(PRINT_SERVER_OVERRIDE_KEY, '');
        return String(raw || '').trim();
    }

    function setPrintServerOverride(value) {
        const trimmed = String(value || '').trim();
        gmSet(PRINT_SERVER_OVERRIDE_KEY, trimmed);
    }

    function getDefaultPrintServer() {
        try {
            const rawSettings = typeof GM_getValue === 'function' ? GM_getValue(STORAGE_KEYS.NEW_RODEO_SETTINGS, null) : null;
            const settings = rawSettings ? JSON.parse(rawSettings) : null;
            const cfg = settings?.Tools?.['FC-art Print'];
            const ipRaw = (cfg?.ip || '').trim();
            let port = (cfg?.port || DEFAULT_PRINT_PORT).toString().trim();

            let host = ipRaw ? ipRaw.replace(/^https?:\/\//i, '').replace(/\/+$/, '') : DEFAULT_PRINT_HOST;
            if (!host) host = DEFAULT_PRINT_HOST;

            if (/:(\d+)$/.test(host)) {
                host = host.replace(/:(\d+)$/, '');
            }
            if (!/^\d{1,5}$/.test(port)) port = DEFAULT_PRINT_PORT;

            return buildDefaultPrintServer(host, port);
        } catch {
            return buildDefaultPrintServer();
        }
    }

    function resolvePrintServer() {
        try {
            const override = getPrintServerOverride();
            if (override) {
                let overrideValue = override.trim();
                if (!/^https?:\/\//i.test(overrideValue)) {
                    overrideValue = `http://${overrideValue}`;
                }
                try {
                    const overrideUrl = new URL(overrideValue);
                    const host = overrideUrl.hostname || DEFAULT_PRINT_HOST;
                    const portRaw = overrideUrl.port || DEFAULT_PRINT_PORT;
                    const port = /^\d{1,5}$/.test(portRaw) ? portRaw : DEFAULT_PRINT_PORT;
                    return buildDefaultPrintServer(host, port);
                } catch { }
            }

            return getDefaultPrintServer();
        } catch {
            return buildDefaultPrintServer();
        }
    }

    function asciihex(str) {
        const input = String(str ?? '');
        if (!input) return '';
        if (typeof TextEncoder === 'function') {
            const bytes = new TextEncoder().encode(input);
            let out = '';
            for (const b of bytes) {
                let hex = b.toString(16);
                if (hex.length < 2) hex = '0' + hex;
                out += hex;
            }
            return out;
        }
        let text = '';
        for (let i = 0; i < input.length; i++) {
            let hex = Number(input.charCodeAt(i)).toString(16);
            if (hex.length < 2) hex = '0' + hex;
            text += hex;
        }
        return text;
    }

    function genId() {
        let id = '';
        for (let i = 0; i < 10; i++) id += Math.floor(Math.random() * 9);
        return id;
    }

    function getDefaultBadgeId() {
        const match = document.cookie.match(/(?:^|; )fcmenu-employeeId=([^;]*)/);
        return match ? decodeURIComponent(match[1]) : '';
    }    // ========== ZPL Bridge: raw ZPL via TCP port 9100 ==========
    // Printmon HTTP API is limited (only Code128 linear barcodes).
    // The ZPL Bridge sends raw ZPL through a local PowerShell bridge that
    // listens on ZPL_BRIDGE_PORT and forwards to Printmon's raw TCP port 9100.
    // This enables QR codes, Code128, and text labels with full ZPL control.
    // Run qr-bridge.ps1 on Desktop to enable ZPL Bridge printing.
    const QR_BRIDGE_PORT = 9200;
    const QR_BRIDGE_URL = `http://localhost:${QR_BRIDGE_PORT}/`;
    let _qrBridgeAvailable = null; // null=unknown, true/false=cached result
    let _qrBridgeLastCheck = 0;
    const QR_BRIDGE_CHECK_INTERVAL = 30000; // re-check every 30s

    /**
     * Build ZPL label string containing a QR code.
     * @param {string} data - The data to encode in the QR code
     * @param {number} [mag=5] - Magnification factor (1-10, default 5)
     * @param {string} [desc=''] - Optional description text below QR
     * @returns {string} Complete ZPL label string
     */
    function buildQrZpl(data, mag = 10, desc = '') {
        const safeMag = Math.max(1, Math.min(10, parseInt(mag, 10) || 10));
        const safeData = String(data || '');
        if (!safeData) return '';
        // Estimated QR size in dots: ~safeMag * 29 modules (typical QR version 3)
        const estQrSize = safeMag * 29;
        // Center on 4" wide label (812 dots at 203 dpi)
        const labelWidth = 812;
        const xPos = Math.max(0, Math.round((labelWidth - estQrSize) / 2));
        const yPos = 50;
        // ^BQN = QR Code, Normal orientation, Model 2
        // ^FDMA, = M=Medium error correction, A=Automatic data mode
        let zpl = `^XA^FO${xPos},${yPos}^BQN,2,${safeMag}^FDMA,${safeData}^FS`;
        if (desc) {
            // Add description text below QR code, centered
            const descYOffset = yPos + estQrSize + 20;
            const safeDesc = String(desc).slice(0, 60);
            // ^FB812,1,0,C = Field Block, full width, 1 line, center justified
            zpl += `^FO0,${descYOffset}^FB${labelWidth},1,0,C^A0N,28,28^FD${safeDesc}^FS`;
        } zpl += '^XZ';
        return zpl;
    }

    /**
     * Build ZPL label string containing a Code128 linear barcode.
     * @param {string} data - The data to encode in the barcode
     * @param {string} [text=''] - Human-readable text (shown below barcode)
     * @param {string} [desc=''] - Optional description lines below text
     * @returns {string} Complete ZPL label string
     */
    function buildCode128Zpl(data, text, desc) {
        const safeData = String(data || '').trim();
        if (!safeData) return '';
        const labelWidth = 812;
        // Estimate barcode width: ~11 modules per char * chars (rough)
        const barcodeHeight = 120;
        // Center barcode on label
        const xPos = 50;
        const yPos = 30;
        // ^BCN = Code 128, Normal orientation
        // ,120 = bar height 120 dots
        // ,Y = print interpretation line (human-readable text below bars)
        // ,N = no check digit
        // ,N = no mode selection
        let zpl = `^XA^FO${xPos},${yPos}^BCN,${barcodeHeight},Y,N,N^FD${safeData}^FS`;
        let curY = yPos + barcodeHeight + 30;
        // Add text label below barcode
        const safeText = String(text || '').trim();
        if (safeText) {
            zpl += `^FO${xPos},${curY}^A0N,24,24^FD${safeText.slice(0, 60)}^FS`;
            curY += 30;
        }
        // Add description lines below
        const safeDesc = String(desc || '').trim();
        if (safeDesc) {
            const descLines = safeDesc.split(/\\&|\r?\n/).slice(0, 4);
            for (const line of descLines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                zpl += `^FO${xPos},${curY}^A0N,22,22^FD${trimmed.slice(0, 60)}^FS`;
                curY += 28;
            }
        }
        zpl += '^XZ';
        return zpl;
    }

    /**
     * Build ZPL for a text-only label. Supports multi-line text.
     * Returns one ^XA...^XZ block per page (8 lines per page).
     * @param {string} textContent - The text content (newline-separated lines)
     * @param {number} [linesPerPage=8] - Max lines per label page
     * @param {number} [maxChars=30] - Max chars per line
     * @returns {string} One or more concatenated ZPL label strings
     */
    function buildTextZpl(textContent, linesPerPage, maxChars) {
        const perPage = linesPerPage || 8;
        const maxC = maxChars || 30;
        const raw = String(textContent || '').replace(/\r/g, '');
        if (!raw.trim()) return '';
        const allLines = raw.split('\n');
        const labelWidth = 812;
        const fontSize = 28;
        const lineHeight = 36;
        const marginX = 30;
        const marginY = 25;
        const blocks = [];
        for (let i = 0; i < allLines.length; i += perPage) {
            const pageLines = allLines.slice(i, i + perPage);
            // Skip empty-only pages (except if it's the only page)
            if (pageLines.every(l => !l.trim()) && allLines.length > perPage) continue;
            let zpl = '^XA';
            let curY = marginY;
            for (const line of pageLines) {
                const safeLine = line.slice(0, maxC).replace(/\^/g, '');
                zpl += `^FO${marginX},${curY}^A0N,${fontSize},${fontSize}^FB${labelWidth - marginX * 2},1,0,L^FD${safeLine}^FS`;
                curY += lineHeight;
            }
            zpl += '^XZ';
            blocks.push(zpl);
        }
        return blocks.join('');
    }

    /**
     * Build appropriate ZPL based on print type.
     * @param {string} printType - 'qrcode', 'barcode', or 'text'
     * @param {object} params - { data, text, desc, quantity }
     * @returns {string} ZPL string (may contain multiple ^XA...^XZ for text pages)
     */
    function buildZplForPrint(printType, params) {
        const copies = Math.max(1, parseInt(params.quantity, 10) || 1);
        let zpl = '';
        if (printType === 'qrcode') {
            zpl = buildQrZpl(params.data || '', 10);
        } else if (printType === 'text') {
            zpl = buildTextZpl(params.desc || '', params.linesPerPage, params.maxChars);
        } else {
            zpl = buildCode128Zpl(params.data || '', params.text || '', params.desc || '');
        }
        if (!zpl) return '';
        // Apply print quantity to all ^XZ blocks
        if (copies > 1) {
            zpl = zpl.replace(/\^XZ/g, `^PQ${copies}^XZ`);
        }
        return zpl;
    }

    /**
     * Check if QR bridge (qr-bridge.ps1) is running.
     * Caches the result for QR_BRIDGE_CHECK_INTERVAL ms.
     * @returns {Promise<boolean>}
     */
    function isQrBridgeAvailable() {
        const now = Date.now();
        if (_qrBridgeAvailable !== null && (now - _qrBridgeLastCheck) < QR_BRIDGE_CHECK_INTERVAL) {
            return Promise.resolve(_qrBridgeAvailable);
        }
        const doCheck = (resolveFn) => {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: QR_BRIDGE_URL,
                    timeout: 2000,
                    onload: (r) => {
                        const ok = String(r.responseText || '').trim() === 'ok';
                        _qrBridgeAvailable = ok;
                        _qrBridgeLastCheck = Date.now();
                        resolveFn(ok);
                    },
                    onerror: () => { _qrBridgeAvailable = false; _qrBridgeLastCheck = Date.now(); resolveFn(false); },
                    ontimeout: () => { _qrBridgeAvailable = false; _qrBridgeLastCheck = Date.now(); resolveFn(false); }
                });
            } else {
                fetch(QR_BRIDGE_URL, { signal: AbortSignal.timeout(2000) })
                    .then(r => r.text())
                    .then(t => {
                        const ok = t.trim() === 'ok';
                        _qrBridgeAvailable = ok;
                        _qrBridgeLastCheck = Date.now();
                        resolveFn(ok);
                    })
                    .catch(() => { _qrBridgeAvailable = false; _qrBridgeLastCheck = Date.now(); resolveFn(false); });
            }
        };
        return new Promise(doCheck);
    }

    /**
     * Send raw ZPL to the QR bridge (which forwards to TCP port 9100).
     * @param {string} zpl - Complete ZPL string (^XA...^XZ)
     * @returns {Promise<{ok: boolean, status: number, body: string}>}
     */
    function sendZplViaBridge(zpl) {
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: QR_BRIDGE_URL,
                    data: zpl,
                    headers: { 'Content-Type': 'text/plain' },
                    timeout: 5000,
                    onload: (r) => {
                        const body = String(r.responseText || '').trim();
                        resolve({ ok: body === 'ok', status: r.status, body });
                    },
                    onerror: () => resolve({ ok: false, status: 0, body: 'network error' }),
                    ontimeout: () => resolve({ ok: false, status: 0, body: 'timeout' })
                });
            } else {
                fetch(QR_BRIDGE_URL, {
                    method: 'POST',
                    body: zpl,
                    headers: { 'Content-Type': 'text/plain' },
                    signal: AbortSignal.timeout(5000)
                })
                    .then(r => r.text().then(t => ({ ok: t.trim() === 'ok', status: r.status, body: t.trim() })))
                    .then(resolve)
                    .catch(() => resolve({ ok: false, status: 0, body: 'network error' }));
            }
        });
    }
    // ========== End ZPL Bridge ==========

    function sendPrintRequest(params) {
        const printServer = resolvePrintServer();
        const silent = !!params?.silent;
        const successMessage = params?.successMessage;
        const overrideValue = getPrintServerOverride();

        function getCookie(c) {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                if (cookies[i].includes(c)) {
                    return cookies[i].substring(cookies[i].indexOf('=') + 1);
                }
            }
            return '';
        }
        const badgeId = params.badgeId !== undefined ? String(params.badgeId) : (getCookie('fcmenu-employeeId') || '1');

        // Auto-detect print server format (try type=qrcode, fallback to type=barcode+format=QR)
        let type = params.type || 'barcode';

        const textSource = params.text || ((type === 'text' && params.data) ? params.data : '');
        const dataSource = params.data || ((type === 'text' && params.text) ? params.text : '');
        const data = dataSource ? encodeURIComponent(asciihex(dataSource)) : '';
        const text = textSource ? encodeURIComponent(asciihex(textSource)) : '';
        const quantity = params.quantity || 1;
        const descSource = params.desc ? String(params.desc) : '';
        const desc = descSource ? encodeURIComponent(asciihex(descSource)) : '';
        const lines = params.lines;
        const cols = params.cols;

        // QR code detection
        const isQR = type === 'qrcode';
        const format = params.format ? String(params.format).toUpperCase() : '';
        const width = params.width;
        const height = params.height;

        // Helper to build a query string from param pairs
        function buildQs(overrides = {}) {
            const t = overrides.type || type;
            const parts = [
                `action=print`,
                `type=${encodeURIComponent(t)}`,
                `data=${data}`,
                text ? `text=${text}` : '',
                desc ? `desc=${desc}` : 'desc=',
            ];
            if (overrides.format) parts.push(`format=${encodeURIComponent(overrides.format)}`);
            else if (!isQR && format) parts.push(`format=${encodeURIComponent(format)}`);
            if (!isQR && lines) parts.push(`lines=${lines}`);
            if (!isQR && cols) parts.push(`cols=${cols}`);
            if (width !== undefined) parts.push(`width=${width}`);
            if (height !== undefined) parts.push(`height=${height}`);
            parts.push(`quantity=${quantity}`);
            parts.push(`badgeid=${badgeId}`);
            parts.push(`seq=${encodeURIComponent(genId())}`);
            return parts.filter(Boolean).join('&');
        }
        // Build primary query string
        let qs;

        if (isQR) {
            // Primary: type=qrcode (for print servers that support it, e.g. MockPrintmon)
            qs = buildQs({ type: 'qrcode' });
            // NOTE: Amazon FC Printmon does NOT support QR codes via its HTTP API.
            // If type=qrcode fails → try QR Bridge (raw ZPL ^BQ) → linear barcode as last resort.
        } else {
            qs = buildQs();
        }

        const printUrl = `${printServer}/printer?${qs}`;
        const logId = PRINT_LOG?.enabled
            ? PRINT_LOG.add({
                id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
                time: new Date().toLocaleString(),
                timeIso: new Date().toISOString(),
                type,
                format,
                quantity,
                server: printServer,
                override: overrideValue || '',
                badgeId,
                dataLen: dataSource ? String(dataSource).length : 0,
                textLen: textSource ? String(textSource).length : 0,
                descLen: descSource ? String(descSource).length : 0,
                lines,
                cols,
                width,
                height,
                url: printUrl.slice(0, 380),
                success: false,
                httpStatus: null,
                body: '',
                error: ''
            })
            : null;

        return new Promise((resolve) => {
            // --- ZPL Bridge: try raw ZPL via bridge for ALL formats ---
            // Strategy: 1) If bridge available → send raw ZPL (QR, Code128, Text)
            //           2) If bridge unavailable or fails → Printmon HTTP API fallback
            //              (Printmon only supports type=barcode for Code128 linear)

            /** Send via Printmon HTTP API (fallback for when bridge is down) */
            function sendViaPrintmon(httpMethod) {
                const fallbackUrl = isQR
                    ? `${printServer}/printer?${buildQs({ type: 'barcode' })}`
                    : printUrl;
                const label = isQR ? 'linear-fallback' : 'printmon';
                console.log(`[BM Print] ${label} URL:`, fallbackUrl.slice(0, 200));

                function onDone(ok, statusCode, bodyStr) {
                    const summary = `${label}:${ok ? 'OK' : 'FAIL'}(${statusCode}|${String(bodyStr).slice(0, 40)})`;
                    console.log(`[BM Print] ${label} ${ok ? 'OK' : 'FAIL'} (HTTP ${statusCode}: ${bodyStr})`);
                    if (PRINT_LOG?.update && logId) {
                        PRINT_LOG.update(logId, {
                            success: ok,
                            httpStatus: Number.isFinite(statusCode) ? statusCode : null,
                            body: summary.slice(0, 300),
                            error: ok ? '' : `${label} failed`
                        });
                    }
                    if (ok) {
                        const msg = isQR
                            ? 'Bridge off — printed as linear barcode'
                            : (successMessage || 'Sent to printer');
                        if (!silent) showFlash(msg, false, 'success');
                    } else {
                        if (!silent) showFlash(`Print failed (${statusCode}): ${String(bodyStr).slice(0, 60)}`, true, 'error');
                    }
                    resolve(ok);
                }

                if (httpMethod === 'gm') {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: fallbackUrl,
                        onload: (r) => {
                            const body = String(r.responseText || '').trim();
                            onDone(body === 'valid', r.status, body);
                        },
                        onerror: () => onDone(false, 0, 'network error')
                    });
                } else {
                    fetch(fallbackUrl)
                        .then(r => r.text().then(t => ({ status: r.status, body: t })))
                        .then(r => {
                            const body = String(r.body || '').trim();
                            onDone(body === 'valid', r.status, body);
                        })
                        .catch(() => onDone(false, 0, 'network error'));
                }
            }

            /** Try ZPL Bridge first, fall back to Printmon HTTP */
            function tryBridgeThenFallback(httpMethod) {
                isQrBridgeAvailable().then((bridgeUp) => {
                    if (!bridgeUp) {
                        console.log('[BM Print] ZPL Bridge not available. Falling back to Printmon HTTP.');
                        sendViaPrintmon(httpMethod);
                        return;
                    }

                    // Build ZPL for the current print type
                    const rawData = dataSource || '';
                    const rawText = params.text || '';
                    const rawDesc = params.desc || descSource || '';
                    const zpl = buildZplForPrint(type, {
                        data: rawData,
                        text: rawText,
                        desc: rawDesc,
                        quantity,
                        linesPerPage: lines || 8,
                        maxChars: cols || 30
                    });

                    if (!zpl) {
                        console.log('[BM Print] Could not build ZPL, falling back to Printmon HTTP.');
                        sendViaPrintmon(httpMethod);
                        return;
                    }

                    const typeLabel = isQR ? 'QR' : (type === 'text' ? 'Text' : 'Code128');
                    console.log(`[BM Print] Bridge available — sending ${typeLabel} via raw ZPL (${zpl.length} bytes)...`);

                    sendZplViaBridge(zpl).then((result) => {
                        const summary = `zpl-bridge:${result.ok ? 'OK' : 'FAIL'}(${result.status}|${result.body})`;
                        console.log(`[BM Print] Bridge ${result.ok ? 'OK' : 'FAIL'}: ${result.body}`);
                        if (PRINT_LOG?.update && logId) {
                            PRINT_LOG.update(logId, {
                                success: result.ok,
                                httpStatus: result.status,
                                body: summary.slice(0, 300),
                                error: result.ok ? '' : 'zpl-bridge failed'
                            });
                        }
                        if (result.ok) {
                            if (!silent) showFlash(`${typeLabel} sent to printer ✓`, false, 'success');
                            resolve(true);
                        } else {
                            console.log('[BM Print] Bridge send failed, falling back to Printmon HTTP...');
                            sendViaPrintmon(httpMethod);
                        }
                    });
                });
            }

            // --- Main entry: always try bridge first ---
            const httpMethod = typeof GM_xmlhttpRequest === 'function' ? 'gm' : 'fetch';
            tryBridgeThenFallback(httpMethod);
        });
    }

    function printmonBarcode(data, text, quantity = 1) {
        return sendPrintRequest({
            type: 'barcode',
            data,
            text,
            quantity: Math.max(1, parseInt(quantity, 10) || 1)
        });
    }

    function printmonTextLabel(text, quantity = 1) {
        return sendPrintRequest({
            type: 'barcode',
            data: '',
            text: '',
            desc: text,
            badgeId: '',
            quantity: Math.max(1, parseInt(quantity, 10) || 1)
        });
    }

    async function printTextRawLabel(text, copies = 1, options = {}) {
        const normalized = normalizeTextForPrint(text);
        const cleaned = normalized.replace(/[\n]+$/g, '');
        if (!cleaned.trim()) {
            if (!options?.silent) showFlash('Text is empty', true, 'error');
            return false;
        }
        return sendPrintRequest({
            type: 'text',
            data: '',
            text: '',
            desc: cleaned,
            format: 'TEXT',
            lines: TEXT_LINES_PER_PAGE,
            cols: TEXT_MAX_CHARS,
            badgeId: '',
            quantity: Math.max(1, parseInt(copies, 10) || 1),
            silent: !!options?.silent
        });
    }

    function runActionWithFeedback(btn, actionFn) {
        const original = btn.textContent;
        Promise.resolve()
            .then(actionFn)
            .then((ok) => {
                if (ok !== false) {
                    btn.textContent = '✅';
                    setTimeout(() => { btn.textContent = original; }, 2000);
                } else {
                    btn.textContent = '❌';
                    setTimeout(() => { btn.textContent = original; }, 1200);
                }
            })
            .catch(() => {
                btn.textContent = '❌';
                setTimeout(() => { btn.textContent = original; }, 1200);
            });
    }

    function createPrintCopiesInput() {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.max = '99';
        input.step = '1';
        input.value = '1';
        input.className = 'bm-input bm-copies-input';
        input.title = 'Print copies';
        Object.assign(input.style, {
            width: '42px',
            padding: '0 2px',
            fontSize: '12px',
            height: '30px',
            lineHeight: '30px',
            textAlign: 'center',
            boxSizing: 'border-box',
            borderRadius: '6px'
        });
        input.addEventListener('input', () => {
            const val = parseInt(input.value, 10);
            if (!val || val < 1) input.value = '1';
        });
        return input;
    }

    function getPrintCopies(input) {
        return Math.max(1, parseInt(input?.value, 10) || 1);
    }

    function closeAllContextMenus() {
        document.querySelectorAll('.bm-folder-menu-open, .bm-barcode-menu-open').forEach(el => {
            el.parentNode && el.parentNode.removeChild(el);
        });
    }

    function buildContextMenu(extraClassName) {
        const menu = document.createElement('div');
        const extra = extraClassName ? ` ${extraClassName}` : '';
        menu.className = `bm-menu bm-folder-options-menu${extra}`;
        menu.style.display = 'flex';
        menu.style.position = 'fixed';
        menu.style.minWidth = '110px';
        menu.style.zIndex = 10001;
        return menu;
    }

    function openContextMenuAtEvent(menu, event, anchor, onClose) {
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            if (menu && menu.parentNode) menu.remove();
            if (typeof onClose === 'function') onClose();
            document.removeEventListener('click', docClick);
        };
        if (menu && !menu.parentNode) {
            document.body.appendChild(menu);
        }
        const rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
        const leftBase = rect ? rect.left : (event?.clientX || 0);
        const topBase = rect ? rect.bottom : (event?.clientY || 0);

        const docClick = (e) => {
            if (!menu.contains(e.target) && e.target !== anchor) close();
        };

        setTimeout(() => {
            const menuRect = menu.getBoundingClientRect();
            const left = Math.max(4, Math.min(window.innerWidth - menuRect.width - 4, leftBase));
            const top = Math.max(4, Math.min(window.innerHeight - menuRect.height - 4, topBase));
            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
        }, 0);

        setTimeout(() => {
            document.addEventListener('click', docClick);
        }, 0);

        return close;
    }

    function copyToClipboard(text) {
        const value = text == null ? '' : String(text);
        if (!value) return false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(() => {
                cacheClipboardValue(value);
                showFlash('Copied', false, 'success');
            }).catch(() => {
                // fallback below
            });
            return true;
        }
        try {
            const ta = document.createElement('textarea');
            ta.value = value;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '-9999px';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            if (ok) {
                cacheClipboardValue(value);
                showFlash('Copied', false, 'success');
                return true;
            }
        } catch { }
        showFlash('Copy failed', true, 'error');
        return false;
    }

    function sendKeyToTarget(target, key) {
        const code = key === 'Enter' ? 13 : key.charCodeAt(0);
        const eventInit = { key, code: '', charCode: code, keyCode: code, which: code, bubbles: true };
        target.dispatchEvent(new KeyboardEvent('keydown', eventInit));
        target.dispatchEvent(new KeyboardEvent('keypress', eventInit));
        target.dispatchEvent(new KeyboardEvent('keyup', eventInit));
    }

    function getTargetElement() {
        const active = document.activeElement;
        if (active && active !== document.body && active !== document.documentElement && !panel.contains(active)) {
            return active;
        }
        return document;
    }

    function getSelectedTextFromDocument() {
        const selection = (typeof window !== 'undefined' && window.getSelection)
            ? window.getSelection()
            : null;
        const selectedText = selection ? String(selection.toString() || '').trim() : '';
        if (selectedText) return selectedText;

        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
            const start = active.selectionStart;
            const end = active.selectionEnd;
            if (typeof start === 'number' && typeof end === 'number' && end > start) {
                return String(active.value || '').slice(start, end).trim();
            }
        }
        return '';
    }

    function sendValueToPage(value) {
        if (!value) return false;
        const target = getTargetElement();
        for (const ch of value) sendKeyToTarget(target, ch);
        sendKeyToTarget(target, 'Enter');
        showFlash('Sent to page', false, 'success');
        return true;
    }

    function isInsideTightHitbox(event, element, insetRatio = 0.18, minInset = 4) {
        if (!event || !element || typeof element.getBoundingClientRect !== 'function') return true;
        const rect = element.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return true;
        let insetX = Math.max(minInset, rect.width * insetRatio);
        let insetY = Math.max(minInset, rect.height * insetRatio);
        if (rect.width - insetX * 2 <= 4) insetX = Math.max(0, rect.width / 2 - 2);
        if (rect.height - insetY * 2 <= 4) insetY = Math.max(0, rect.height / 2 - 2);
        const x = event.clientX;
        const y = event.clientY;
        return x >= rect.left + insetX && x <= rect.right - insetX && y >= rect.top + insetY && y <= rect.bottom - insetY;
    }

    function sendClipboardToPage() {
        const readClipboard = (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText)
            ? navigator.clipboard.readText.bind(navigator.clipboard)
            : null;

        const promptAndSend = () => {
            const manual = window.prompt('Paste the barcode/text to send:', '');
            const manualValue = String(manual || '').trim();
            if (manualValue) {
                cacheClipboardValue(manualValue);
                return sendValueToPage(manualValue);
            }
            const cached = getCachedClipboardValue();
            if (cached) {
                showFlash('Using cached value', false, 'info');
                return sendValueToPage(cached);
            }
            showFlash('No value provided', true, 'error');
            return false;
        };

        if (!readClipboard) {
            return Promise.resolve(promptAndSend());
        }

        const perms = (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query)
            ? navigator.permissions.query.bind(navigator.permissions)
            : null;

        const readIfAllowed = () => readClipboard()
            .then((text) => {
                const value = String(text || '').trim();
                if (!value) {
                    showFlash('Clipboard is empty', true, 'error');
                    return false;
                }
                cacheClipboardValue(value);
                return sendValueToPage(value);
            })
            .catch(() => {
                showFlash('Clipboard access denied', true, 'error');
                return false;
            });

        const readAttempt = () => readClipboard()
            .then((text) => {
                const value = String(text || '').trim();
                if (!value) {
                    showFlash('Clipboard is empty', true, 'error');
                    return false;
                }
                cacheClipboardValue(value);
                return sendValueToPage(value);
            })
            .catch(() => promptAndSend());

        if (!perms) {
            return Promise.resolve(readAttempt());
        }

        return perms({ name: 'clipboard-read' })
            .then((status) => {
                if (status && status.state === 'denied') {
                    return promptAndSend();
                }
                return readAttempt();
            })
            .catch(() => readAttempt());
    }

    function normalizePrintFormat(format) {
        const fmt = String(format || '').toUpperCase();
        if (!fmt) return '';
        if (['B00', 'LPN', 'X00'].includes(fmt)) return 'CODE128';
        if (fmt === '2D') return 'QR';
        return fmt;
    }

    function resolvePrintType(format) {
        const fmt = String(format || '').toUpperCase();
        if (!fmt) return 'barcode';
        // MockPrintmon uses type=qrcode for QR codes
        if (fmt === 'QR' || fmt === 'QRCODE' || fmt === '2D') return 'qrcode';
        return 'barcode';
    }

    const QR_PRINT_SIZE = 150;
    const PRINT_DESC_MAX_CHARS = 31;
    const PRINT_DESC_MAX_LINES = 4;

    function joinDescLinesForPrint(lines) {
        const clean = (lines || [])
            .map(s => String(s || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean);
        if (!clean.length) return '';

        let mode = String(window.__BM_PRINT_DESC_NEWLINE || '').trim().toUpperCase();
        if (!mode) {
            const server = resolvePrintServer();
            mode = /:5965\b/.test(server) ? 'LF' : 'ZPL';
        }

        switch (mode) {
            case 'CRLF':
                return clean.join('\r\n');
            case 'LF':
                return clean.join('\n');
            case 'SPACE':
                return clean.join(' | ');
            case 'FIRST':
                return clean[0];
            case 'ZPL':
            default:
                return clean.join('\\&');
        }
    }

    function wrapDescWords(text, maxChars) {
        const raw = String(text || '').replace(/\s+/g, ' ').trim();
        if (!raw) return [];
        const words = raw.split(' ');
        const lines = [];
        let line = '';
        for (const w of words) {
            if (!w) continue;
            if (!line) {
                line = w;
                continue;
            }
            if ((line.length + 1 + w.length) <= maxChars) {
                line += ' ' + w;
            } else {
                lines.push(line);
                line = w;
            }
        }
        if (line) lines.push(line);
        return lines;
    }

    function formatDescForPrint(rawDesc) {
        const desc = String(rawDesc || '').replace(/\s+/g, ' ').trim();
        if (!desc) return '';
        const lines = wrapDescWords(desc, PRINT_DESC_MAX_CHARS);
        const limited = lines.slice(0, PRINT_DESC_MAX_LINES);
        return joinDescLinesForPrint(limited);
    }

    // --- Print entrypoint used by UI, batch actions, folder print-all, and modals ---
    async function printBarcodeValue(value, format, copies = 1, options = {}) {
        if (value == null || String(value).trim() === '') {
            if (!options?.silent) showFlash('Value is empty', true, 'error');
            return false;
        }
        const qty = Math.max(1, parseInt(copies, 10) || 1);
        const fmt = String(format || '').toUpperCase();
        if (fmt === 'TEXT') {
            if (options?.useRawText) {
                return printTextRawLabel(String(value), qty, options);
            }
            return printTextLabel(String(value), qty, options);
        }
        const printFormat = normalizePrintFormat(fmt);
        const printType = resolvePrintType(printFormat);
        const labelName = options?.label || options?.name || options?.title || '';
        // Check printType for QR (MockPrintmon style)
        const isQr = printType === 'qrcode';
        const isCode128 = printFormat === 'CODE128';
        const wrappedValue = wrapPrintValue(String(value), TEXT_MAX_CHARS);
        const wrappedLines = wrappedValue ? wrappedValue.split('\n') : [];
        const valueTextLine = wrappedLines.shift() || '';
        const valueOverflowLines = wrappedLines.filter(line => line !== '');
        const textForPrint = isQr
            ? (labelName ? labelName : wrappedValue)
            : valueTextLine;
        const badgeId = fmt === 'TEXT' ? '' : getDefaultBadgeId();
        let descPayload = '';
        const badgeLine = badgeId ? `(${badgeId})` : '';
        const descLines = [];
        if (badgeLine) descLines.push(badgeLine);
        if (labelName) descLines.push(labelName);
        if (!isQr && valueOverflowLines.length) descLines.push(...valueOverflowLines);
        descPayload = formatDescForPrint(descLines.join('\n'));
        return sendPrintRequest({
            type: printType,
            data: String(value),
            text: textForPrint,
            desc: descPayload,
            badgeId,
            quantity: qty,
            format: printFormat,
            width: isQr ? QR_PRINT_SIZE : undefined,
            height: isQr ? QR_PRINT_SIZE : undefined,
            silent: !!options?.silent
        });
    }

    function printBarcodeModal(value, quantity = 1) {
        return printBarcodeValue(value, 'BARCODE', quantity);
    }

    const TEXT_LINES_PER_PAGE = 8;
    const TEXT_MAX_PAGES = 10;
    const TEXT_MAX_LINES = TEXT_LINES_PER_PAGE * TEXT_MAX_PAGES;
    const TEXT_MAX_CHARS = 30;

    function addTextPageDivider(element, lineHeightPx, linesPerPage, color = '#999') {
        if (!element) return;
        const existing = element.querySelector('.bm-text-page-divider');
        if (existing) existing.remove();
        if (!element.style.position) element.style.position = 'relative';
        const styles = window.getComputedStyle?.(element);
        const paddingTop = styles ? (parseFloat(styles.paddingTop || '0') || 0) : 0;
        const divider = document.createElement('div');
        divider.className = 'bm-text-page-divider';
        Object.assign(divider.style, {
            position: 'absolute',
            left: '0',
            right: '0',
            top: `${Math.round(paddingTop + (lineHeightPx * linesPerPage))}px`,
            borderTop: `1px dashed ${color}`,
            pointerEvents: 'none'
        });
        element.appendChild(divider);
    }

    function addTextPageDividers(element, lineHeightPx, linesPerPage, color = '#999') {
        if (!element) return;
        element.querySelectorAll('.bm-text-page-divider').forEach(el => el.remove());
        if (!element.style.position) element.style.position = 'relative';
        const styles = window.getComputedStyle?.(element);
        const paddingTop = styles ? (parseFloat(styles.paddingTop || '0') || 0) : 0;
        const pageHeight = Math.round(lineHeightPx * linesPerPage);
        const totalHeight = element.scrollHeight || 0;
        if (!totalHeight || pageHeight <= 0) {
            addTextPageDivider(element, lineHeightPx, linesPerPage, color);
            return;
        }
        const pageCount = Math.floor(totalHeight / pageHeight);
        for (let i = 1; i <= pageCount; i++) {
            const divider = document.createElement('div');
            divider.className = 'bm-text-page-divider';
            Object.assign(divider.style, {
                position: 'absolute',
                left: '0',
                right: '0',
                top: `${Math.round(paddingTop + (pageHeight * i))}px`,
                borderTop: `1px dashed ${color}`,
                pointerEvents: 'none'
            });
            element.appendChild(divider);
        }
    }

    function applyTextareaPageDivider(textarea, fontSizePx, lineHeightRatio = 1.2, linesPerPage = TEXT_LINES_PER_PAGE, color = '#999') {
        if (!textarea) return;
        const lineHeightPx = fontSizePx * lineHeightRatio;
        const y = Math.round(lineHeightPx * linesPerPage);
        textarea.style.lineHeight = String(lineHeightRatio);
        textarea.style.backgroundImage = `linear-gradient(to right, ${color} 50%, rgba(0,0,0,0) 0)`;
        textarea.style.backgroundSize = '8px 1px';
        textarea.style.backgroundRepeat = 'repeat-x';
        textarea.style.backgroundPosition = `0 ${y}px`;
        textarea.style.backgroundColor = '#fff';
    }

    function wrapPrintValue(raw, maxChars = TEXT_MAX_CHARS) {
        const input = String(raw ?? '');
        if (!input) return '';
        const out = [];
        let current = '';
        for (let i = 0; i < input.length; i++) {
            const ch = input[i];
            if (ch === '\n') {
                out.push(current);
                current = '';
                continue;
            }
            current += ch;
            if (current.length >= maxChars) {
                out.push(current);
                current = '';
            }
        }
        if (current) out.push(current);
        return out.join('\n');
    }

    function normalizeTextForPrint(raw) {
        let text = String(raw ?? '');
        text = text
            .replace(/\u00A0/g, ' ')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/\u2026/g, '...')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\t/g, '    ')
            .replace(/\r/g, '');
        if (typeof text.normalize === 'function') {
            text = text.normalize('NFKC');
        }
        return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    }

    function truncateByColumns(text, maxCols) {
        let out = '';
        let cols = 0;
        for (const ch of String(text ?? '')) {
            const code = ch.codePointAt(0) || 0;
            const width = (code === 0xA0 || code <= 0x7f) ? 1 : 2;
            if (cols + width > maxCols) break;
            out += ch;
            cols += width;
        }
        return out;
    }

    function justifyLinePreserve(line, maxChars) {
        if (!line || line.length >= maxChars) return line;
        const extra = maxChars - line.length;
        if (extra <= 0) return line;

        const runs = [];
        for (let i = 0; i < line.length;) {
            if (line[i] === ' ') {
                let j = i + 1;
                while (j < line.length && line[j] === ' ') j++;
                runs.push({ start: i, end: j });
                i = j;
            } else {
                i++;
            }
        }

        if (runs.length === 0) return line;

        const base = Math.floor(extra / runs.length);
        let remainder = extra % runs.length;
        let out = '';
        let cursor = 0;

        runs.forEach((run, idx) => {
            out += line.slice(cursor, run.start);
            const runLen = run.end - run.start;
            const add = base + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder--;
            out += ' '.repeat(runLen + add);
            cursor = run.end;
        });

        out += line.slice(cursor);
        return out;
    }

    function wrapJustifyText(raw, maxChars) {
        const input = String(raw ?? '').replace(/\r/g, '');
        if (!input) return '';
        const lines = input.split('\n');
        const out = [];

        for (const line of lines) {
            if (line === '') {
                out.push('');
                continue;
            }
            const indentMatch = line.match(/^[ \t]+/);
            const indentRaw = indentMatch ? indentMatch[0] : '';
            const indent = indentRaw.replace(/\t/g, '    ');
            const content = line.slice(indentRaw.length);
            const words = content.trim().split(/\s+/).filter(Boolean);
            if (words.length === 0) {
                out.push(indent);
                continue;
            }
            const maxLen = Math.max(1, maxChars - indent.length);
            let current = [];
            let curLen = 0;

            for (const word of words) {
                if (current.length === 0) {
                    current = [word];
                    curLen = word.length;
                    continue;
                }
                if (curLen + 1 + word.length <= maxLen) {
                    current.push(word);
                    curLen += 1 + word.length;
                    continue;
                }
                let lineText = current.join(' ');
                if (current.length > 1) {
                    lineText = justifyLinePreserve(lineText, maxLen);
                }
                out.push(indent + lineText);
                current = [word];
                curLen = word.length;
            }
            if (current.length) {
                out.push(indent + current.join(' '));
            }
        }

        return out.join('\n');
    }

    function getMaxCharsForElement(el, fallback = TEXT_MAX_CHARS) {
        if (!el) return fallback;
        const rect = el.getBoundingClientRect?.();
        const width = rect?.width || el.clientWidth || 0;
        if (!width) return fallback;
        const styles = window.getComputedStyle?.(el);
        if (!styles) return fallback;
        const fontStyle = styles.fontStyle || 'normal';
        const fontWeight = styles.fontWeight || 'normal';
        const fontSize = styles.fontSize || '12px';
        const fontFamily = styles.fontFamily || 'monospace';
        const paddingLeft = parseFloat(styles.paddingLeft || '0') || 0;
        const paddingRight = parseFloat(styles.paddingRight || '0') || 0;
        const usableWidth = Math.max(0, width - paddingLeft - paddingRight);
        if (!usableWidth) return fallback;
        const canvas = getMaxCharsForElement._canvas || (getMaxCharsForElement._canvas = document.createElement('canvas'));
        const ctx = canvas.getContext('2d');
        if (!ctx) return fallback;
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
        const sample = '0000000000';
        const metrics = ctx.measureText(sample);
        const charWidth = metrics?.width ? metrics.width / sample.length : 0;
        if (!charWidth) return fallback;
        return Math.max(1, Math.floor(usableWidth / charWidth));
    }

    function clampTextLines(raw, maxLines = TEXT_MAX_LINES, maxChars = TEXT_MAX_CHARS, options = {}) {
        const { justify = false } = options;
        const input = String(raw ?? '').replace(/\r/g, '');
        const originalLines = input.split('\n');
        const needsWrap = originalLines.length > maxLines || originalLines.some(l => l.length > maxChars);

        if (!needsWrap && !justify) {
            const trimmed = originalLines.slice(0, maxLines);
            const maxLineLen = trimmed.reduce((m, l) => Math.max(m, l.length), 0);
            return {
                text: trimmed.join('\n'),
                lineCount: trimmed.length,
                maxChars,
                maxLineLen,
                lines: trimmed
            };
        }

        const wrapped = [];

        for (const rawLine of originalLines) {
            if (wrapped.length >= maxLines) break;

            if (rawLine === '') {
                wrapped.push('');
                continue;
            }

            let remaining = rawLine;
            while (remaining.length > 0 && wrapped.length < maxLines) {
                if (remaining.length <= maxChars) {
                    wrapped.push(remaining);
                    break;
                }

                let breakPos = -1;
                for (let i = maxChars; i >= 0; i--) {
                    if (i < remaining.length && /\s/.test(remaining[i])) {
                        breakPos = i;
                        break;
                    }
                }

                if (breakPos <= 0) {
                    wrapped.push(remaining.slice(0, maxChars));
                    remaining = remaining.slice(maxChars);
                    continue;
                }

                const linePart = remaining.slice(0, breakPos);
                const nextPart = remaining.slice(breakPos);
                const shouldJustify = justify && linePart.length < maxChars && /\S/.test(linePart);
                const finalLine = shouldJustify ? justifyLinePreserve(linePart, maxChars) : linePart;
                wrapped.push(finalLine);
                remaining = nextPart;
            }
        }

        const maxLineLen = wrapped.reduce((m, l) => Math.max(m, l.length), 0);
        return {
            text: wrapped.join('\n'),
            lineCount: wrapped.length,
            maxChars,
            maxLineLen,
            lines: wrapped
        };
    }

    function preserveSpacesForPrint(text) {
        return String(text ?? '')
            .split('\n')
            .map(line => {
                let rest = line;
                let prefix = '';
                const leadMatch = rest.match(/^ +/);
                if (leadMatch) {
                    prefix = '\u00A0'.repeat(leadMatch[0].length);
                    rest = rest.slice(leadMatch[0].length);
                }
                rest = rest.replace(/ {2,}/g, (m) => '\u00A0'.repeat(m.length));
                return prefix + rest;
            })
            .join('\n');
    }

    async function printTextLabel(text, copies = 1, options = {}) {
        const normalized = normalizeTextForPrint(text);
        if (!normalized.trim()) {
            if (!options?.silent) showFlash('Text is empty', true, 'error');
            return false;
        }

        const clamped = clampTextLines(normalized, TEXT_MAX_LINES, TEXT_MAX_CHARS, { justify: false });
        const printableLines = clamped.lines.slice();
        while (printableLines.length && printableLines[printableLines.length - 1].trim() === '') {
            printableLines.pop();
        }

        const pages = [];
        for (let i = 0; i < printableLines.length; i += TEXT_LINES_PER_PAGE) {
            const chunk = printableLines.slice(i, i + TEXT_LINES_PER_PAGE).join('\n');
            if (chunk.trim() === '' && printableLines.length > TEXT_LINES_PER_PAGE) continue;
            pages.push(chunk);
        }

        if (pages.length === 0) {
            showFlash('Text is empty', true, 'error');
            return false;
        }

        let successCount = 0;
        for (const page of pages) {
            const fixedLines = page
                .split('\n')
                .slice(0, TEXT_LINES_PER_PAGE)
                .map((line) => preserveSpacesForPrint(truncateByColumns(line.replace(/\s+$/g, ''), TEXT_MAX_CHARS)));
            const payload = fixedLines.join('\r\n').replace(/(\r\n)+$/g, '');
            const ok = await sendPrintRequest({
                type: 'text',
                data: '',
                text: '',
                desc: payload,
                format: 'TEXT',
                lines: TEXT_LINES_PER_PAGE,
                cols: TEXT_MAX_CHARS,
                badgeId: '',
                quantity: Math.max(1, parseInt(copies, 10) || 1),
                silent: true
            });
            if (ok) successCount++;
        }

        const isError = successCount < pages.length;
        const message = isError
            ? `Print result: ${successCount}/${pages.length} pages`
            : `Sent to printer: ${successCount}/${pages.length} pages`;
        if (!options?.silent) {
            showFlash(message, isError, isError ? 'error' : 'success');
        }

        return !isError;
    }

    function showTextPrintModal() {
        const existing = document.getElementById('bm-text-print-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'bm-text-print-modal';
        modal.className = 'bm-modal';
        modal.dataset.noAutoclose = '1';
        Object.assign(modal.style, {
            padding: '12px',
            minWidth: '260px',
            zIndex: '10002'
        });

        const header = document.createElement('div');
        header.className = 'bm-header';
        header.textContent = 'Print Text Label (2" x 1.25")';
        header.style.fontSize = '14px';
        header.style.marginBottom = '6px';

        const hint = document.createElement('div');
        hint.className = 'bm-text';
        hint.textContent = `${TEXT_MAX_LINES} lines • ${TEXT_MAX_CHARS} chars per line • max ${TEXT_MAX_PAGES} pages`;
        hint.style.fontSize = '12px';
        hint.style.color = '#666';
        hint.style.marginBottom = '6px';

        const folderLabel = document.createElement('div');
        folderLabel.className = 'bm-text';
        folderLabel.textContent = 'Folder';
        folderLabel.style.fontSize = '12px';
        folderLabel.style.color = '#666';
        folderLabel.style.marginBottom = '0';
        folderLabel.style.whiteSpace = 'nowrap';

        const folderSelect = createFolderDestinationSelect(activeFolder || 'Default', activeSubFolder || '', {
            marginBottom: '0',
            fontSize: '12px',
            padding: '4px 6px',
            height: '28px',
            flex: '1',
            minWidth: '0'
        });
        folderSelect.style.marginBottom = '0';
        folderSelect.style.fontSize = '12px';
        folderSelect.style.padding = '4px 6px';
        folderSelect.style.height = '28px';
        folderSelect.style.flex = '1';
        folderSelect.style.minWidth = '0';

        const textarea = document.createElement('textarea');
        textarea.className = 'bm-input bm-modal-scroll';
        textarea.rows = 8;
        textarea.placeholder = 'Type your text here...';
        textarea.style.fontFamily = 'monospace';
        textarea.style.fontSize = '12px';
        textarea.style.lineHeight = '1.2';
        textarea.style.resize = 'none';
        textarea.style.width = '230px';

        const counter = document.createElement('div');
        counter.className = 'bm-text';
        counter.style.fontSize = '11px';
        counter.style.color = '#777';
        counter.style.marginTop = '4px';

        const updateCounter = () => {
            const clamped = clampTextLines(textarea.value, TEXT_MAX_LINES, TEXT_MAX_CHARS);
            const lineCount = Math.min(clamped.lineCount, TEXT_MAX_LINES);
            const maxLineLen = Math.min(clamped.maxLineLen || 0, TEXT_MAX_CHARS);
            counter.textContent = `Lines: ${lineCount}/${TEXT_MAX_LINES} • Max line length: ${maxLineLen}/${TEXT_MAX_CHARS}`;
        };

        textarea.addEventListener('input', () => {
            const clamped = clampTextLines(textarea.value, TEXT_MAX_LINES, TEXT_MAX_CHARS);
            if (clamped.text !== textarea.value) {
                const pos = textarea.selectionStart;
                textarea.value = clamped.text;
                textarea.selectionStart = textarea.selectionEnd = Math.min(pos, textarea.value.length);
            }
            updateCounter();
        });
        updateCounter();

        const folderRow = document.createElement('div');
        Object.assign(folderRow.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '6px'
        });

        const buttonsRow = document.createElement('div');
        Object.assign(buttonsRow.style, {
            display: 'flex',
            gap: '8px',
            marginTop: '10px',
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'nowrap'
        });

        const copyBtn = document.createElement('button');
        copyBtn.className = 'bm-button';
        copyBtn.textContent = '📝';
        copyBtn.title = 'Copy';
        copyBtn.addEventListener('click', () => runActionWithFeedback(copyBtn, () => {
            const clamped = clampTextLines(textarea.value, TEXT_MAX_LINES, TEXT_MAX_CHARS);
            textarea.value = clamped.text;
            return copyToClipboard(clamped.text);
        }));

        const saveBtn = document.createElement('button');
        saveBtn.className = 'bm-button';
        saveBtn.textContent = 'OK';
        saveBtn.addEventListener('click', () => {
            const clamped = clampTextLines(textarea.value, TEXT_MAX_LINES, TEXT_MAX_CHARS);
            textarea.value = clamped.text;
            const line1 = clamped.text.split('\n')[0]?.trim();
            const name = line1 ? line1.slice(0, 30) : `Text Label ${new Date().toLocaleString()}`;
            const { folder, subfolder } = getSelectedFolderDestination(folderSelect, 'Default');
            idbAddBarcode({ name, value: clamped.text, format: 'TEXT', folder, subfolder, pinned: false }).then(() => {
                activeFolder = folder || null;
                activeSubFolder = subfolder || null;
                renderFolders();
                showFlash('Saved to folder', false, 'success');
                modal.remove();
            });
        });

        const printCopiesInput = createPrintCopiesInput();

        const printBtn = document.createElement('button');
        printBtn.className = 'bm-button';
        printBtn.textContent = '🖨️';
        printBtn.title = 'Print';
        printBtn.addEventListener('click', () => runActionWithFeedback(printBtn, () => {
            const clamped = clampTextLines(textarea.value, TEXT_MAX_LINES, TEXT_MAX_CHARS);
            textarea.value = clamped.text;
            const copies = getPrintCopies(printCopiesInput);
            return printBarcodeValue(clamped.text, 'TEXT', copies);
        }));

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => modal.remove());

        folderRow.append(folderLabel, folderSelect);
        buttonsRow.append(copyBtn, printBtn, printCopiesInput, saveBtn, cancelBtn);
        modal.append(header, hint, folderRow, textarea, counter, buttonsRow);
        panel.appendChild(modal);
        wireModalIdleTracking(modal);

        applyTextareaPageDivider(textarea, 12, 1.2, TEXT_LINES_PER_PAGE);

        textarea.focus();
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                modal.remove();
            }
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                printBtn.click();
            }
        });
    }

    function showTextEditModal(barcode) {
        const existing = document.getElementById('bm-text-edit-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'bm-text-edit-modal';
        modal.className = 'bm-modal';
        modal.dataset.noAutoclose = '1';
        Object.assign(modal.style, {
            padding: '12px',
            minWidth: '260px',
            zIndex: '10002'
        });

        const header = document.createElement('div');
        header.className = 'bm-header';
        header.textContent = 'Edit Text Label';
        header.style.fontSize = '14px';
        header.style.marginBottom = '6px';

        const nameInput = document.createElement('input');
        nameInput.className = 'bm-input';
        nameInput.placeholder = 'Name';
        nameInput.style.marginBottom = '6px';
        nameInput.value = barcode?.name || '';

        const folderSelect = createFolderDestinationSelect(barcode?.folder || 'Default', barcode?.subfolder || '', {
            marginBottom: '6px'
        });
        folderSelect.style.marginBottom = '6px';

        const textarea = document.createElement('textarea');
        textarea.className = 'bm-input bm-modal-scroll';
        textarea.rows = 8;
        textarea.placeholder = 'Type your text here...';
        textarea.style.fontFamily = 'monospace';
        textarea.style.fontSize = '12px';
        textarea.style.lineHeight = '1.2';
        textarea.style.resize = 'none';
        textarea.style.width = '230px';
        textarea.value = barcode?.value || '';

        const counter = document.createElement('div');
        counter.className = 'bm-text';
        counter.style.fontSize = '11px';
        counter.style.color = '#777';
        counter.style.marginTop = '4px';

        const updateCounter = () => {
            const clamped = clampTextLines(textarea.value, TEXT_MAX_LINES, TEXT_MAX_CHARS);
            const lineCount = Math.min(clamped.lineCount, TEXT_MAX_LINES);
            const maxLineLen = Math.min(clamped.maxLineLen || 0, TEXT_MAX_CHARS);
            counter.textContent = `Lines: ${lineCount}/${TEXT_MAX_LINES} • Max line length: ${maxLineLen}/${TEXT_MAX_CHARS}`;
        };

        textarea.addEventListener('input', () => {
            const clamped = clampTextLines(textarea.value, TEXT_MAX_LINES, TEXT_MAX_CHARS);
            if (clamped.text !== textarea.value) {
                const pos = textarea.selectionStart;
                textarea.value = clamped.text;
                textarea.selectionStart = textarea.selectionEnd = Math.min(pos, textarea.value.length);
            }
            updateCounter();
        });
        updateCounter();

        const btnRow = document.createElement('div');
        Object.assign(btnRow.style, {
            display: 'flex',
            gap: '8px',
            marginTop: '10px',
            justifyContent: 'center'
        });

        const saveBtn = document.createElement('button');
        saveBtn.className = 'bm-button';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', () => {
            const clamped = clampTextLines(textarea.value, TEXT_MAX_LINES, TEXT_MAX_CHARS);
            textarea.value = clamped.text;
            const name = nameInput.value.trim() || (clamped.text.split('\n')[0]?.trim() || 'Text Label');
            const { folder, subfolder } = getSelectedFolderDestination(folderSelect, 'Default');
            idbUpdateBarcode(barcode.id, { name, value: clamped.text, format: 'TEXT', folder, subfolder }).then(() => {
                activeFolder = folder || null;
                activeSubFolder = subfolder || null;
                renderFolders();
                showFlash('Text updated', false, 'success');
                modal.remove();
            });
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => modal.remove());

        btnRow.append(saveBtn, cancelBtn);
        modal.append(header, nameInput, folderSelect, textarea, counter, btnRow);
        panel.appendChild(modal);
        wireModalIdleTracking(modal);

        applyTextareaPageDivider(textarea, 12, 1.2, TEXT_LINES_PER_PAGE);

        textarea.focus();
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                modal.remove();
            }
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                saveBtn.click();
            }
        });
    }

    // ============================================================
    // SECTION: UI State, Modal Lifetime, and Panel Auto-Close
    // ------------------------------------------------------------
    // These functions coordinate shared DOM state. They rely on
    // panel/form/footer variables created later in this same IIFE.
    // ============================================================

    const PANEL_AUTO_CLOSE_MS = 15000;
    const MODAL_AUTO_CLOSE_MS = 25000;
    let panelAutoCloseTimer = null;
    let modalAutoCloseTimer = null;
    let panelHovering = false;
    let modalHovering = false;
    function isAnyBmModalOpen() {
        return !!document.querySelector('.bm-modal') || !!document.getElementById('bm-barcode-zoom-modal');
    }
    function closeAllBmModals() {
        const zoom = document.getElementById('bm-barcode-zoom-modal');
        if (zoom) {
            if (zoom._bmAutoCloseTimer) {
                clearTimeout(zoom._bmAutoCloseTimer);
                zoom._bmAutoCloseTimer = null;
            }
            if (zoom._bmAutoCloseInterval) {
                clearInterval(zoom._bmAutoCloseInterval);
                zoom._bmAutoCloseInterval = null;
            }
            zoom.remove();
            localStorage.removeItem(STORAGE_KEYS.BARCODE_MODAL);
        }
        document.querySelectorAll('.bm-modal').forEach((modal) => {
            modal.remove();
        });
    }
    function closePanelAndModals() {
        closeAllBmModals();
        closeSettingsDropdown();
        closeSearchUI();
        closeDropdown();
        closeAllContextMenus();
        closeOpenFolderMenu();
        if (panel.style.display !== 'none') {
            panel.style.display = 'none';
        }
        clearPanelAutoClose();
        clearModalAutoClose();
    }
    function isPanelListViewActive() {
        if (panel.style.display === 'none') return false;
        if (isAnyBmModalOpen()) return false;
        if (!formWrapper || !folderDisplay) return true;
        const formHidden = formWrapper.style.display === 'none' || window.getComputedStyle(formWrapper).display === 'none';
        const folderVisible = folderDisplay.style.display !== 'none' && window.getComputedStyle(folderDisplay).display !== 'none';
        return formHidden && folderVisible;
    }

    function schedulePanelAutoClose() {
        if (!isPanelListViewActive()) return;
        if (panelAutoCloseTimer) {
            clearTimeout(panelAutoCloseTimer);
        }
        panelAutoCloseTimer = setTimeout(() => {
            if (!isPanelListViewActive()) {
                panelAutoCloseTimer = null;
                return;
            }
            closeSettingsDropdown();
            closeSearchUI();
            closeDropdown();
            closeAllContextMenus();
            closeOpenFolderMenu();
            panel.style.display = 'none';
            panelAutoCloseTimer = null;
        }, PANEL_AUTO_CLOSE_MS);
    }

    function clearPanelAutoClose() {
        if (panelAutoCloseTimer) {
            clearTimeout(panelAutoCloseTimer);
            panelAutoCloseTimer = null;
        }
    }

    function scheduleModalAutoClose() {
        if (!isAnyBmModalOpen()) {
            clearModalAutoClose();
            return;
        }
        if (document.querySelector('.bm-modal[data-no-autoclose="1"]')) {
            clearModalAutoClose();
            return;
        }
        if (panel.style.display === 'none') {
            clearModalAutoClose();
            return;
        }
        clearModalAutoClose();
        modalAutoCloseTimer = setTimeout(() => {
            if (!isAnyBmModalOpen()) return;
            if (document.querySelector('.bm-modal[data-no-autoclose="1"]')) return;
            closePanelAndModals();
        }, MODAL_AUTO_CLOSE_MS);
    }

    function clearModalAutoClose() {
        if (modalAutoCloseTimer) {
            clearTimeout(modalAutoCloseTimer);
            modalAutoCloseTimer = null;
        }
    }

    function resetModalAutoCloseOnActivity() {
        clearModalAutoClose();
        clearPanelAutoClose();
        if (!document.querySelector('.bm-modal[data-no-autoclose="1"]')) {
            scheduleModalAutoClose();
        }
    }

    function wireModalIdleTracking(modal) {
        if (!modal) return;
        const handler = () => {
            resetModalAutoCloseOnActivity();
        };
        ['mousedown', 'keydown', 'input', 'focusin', 'wheel', 'touchstart', 'mousemove'].forEach((evt) => {
            modal.addEventListener(evt, handler, { passive: true });
        });
        resetModalAutoCloseOnActivity();
    }

    function togglePanel() {
        if (panel.style.display === 'none') {
            updatePanelPosition();
            panel.style.display = 'flex';
            schedulePanelAutoClose();
            scheduleQrPreviewPrefetch();
        } else {
            panel.style.display = 'none';
            clearPanelAutoClose();
        }
    }
    // ============================================================
    // SECTION: UI Shell - Floating Button, Panel, Header, Search
    // ------------------------------------------------------------
    // Builds the visible Tampermonkey overlay. Many later UI
    // functions close over these DOM nodes, so keep declaration
    // order stable unless the whole panel lifecycle is tested.
    // ============================================================

    // Floating Button
    const floatingContainer = document.createElement('div');
    Object.assign(floatingContainer.style, {
        position: 'fixed',
        top: '70px',
        right: '15px',
        zIndex: '9999',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '6px',
        fontFamily: 'sans-serif'
    });

    const floatingButton = document.createElement('div');
    Object.assign(floatingButton.style, {
        width: '34px',
        height: '34px',
        backgroundColor: '#81c784',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
        cursor: 'pointer',
        transition: 'background 0.3s, transform 0.3s',
        fontFamily: 'sans-serif'
    });

    const buttonSpan = document.createElement('span');
    buttonSpan.textContent = '+';
    Object.assign(buttonSpan.style, {
        fontSize: '24px',
        color: '#FFFFFF',
        fontFamily: 'sans-serif'
    });

    floatingButton.style.position = 'relative';
    floatingButton.appendChild(buttonSpan);
    floatingContainer.appendChild(floatingButton);

    const floatingBadge = document.createElement('div');
    Object.assign(floatingBadge.style, {
        position: 'absolute',
        top: '-5px',
        left: '-5px',
        backgroundColor: '#e74c3c',
        color: '#ffffff',
        fontSize: '10px',
        fontWeight: 'bold',
        padding: '2px 5px',
        borderRadius: '10px',
        display: 'none',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        pointerEvents: 'none',
        zIndex: '10'
    });
    floatingButton.appendChild(floatingBadge);

    const floatingSnoozeLabel = document.createElement('div');
    floatingSnoozeLabel.style.display = 'none';
    floatingSnoozeLabel.style.marginLeft = '1px';
    floatingSnoozeLabel.style.padding = '3px 7px';
    floatingSnoozeLabel.style.borderRadius = '999px';
    floatingSnoozeLabel.style.background = '#ffffff';
    floatingSnoozeLabel.style.border = '1px solid #c8dbf2';
    floatingSnoozeLabel.style.boxShadow = '0 2px 5px rgba(0,0,0,0.12)';
    floatingSnoozeLabel.style.color = '#1f4e79';
    floatingSnoozeLabel.style.fontSize = '11px';
    floatingSnoozeLabel.style.fontWeight = '700';
    floatingSnoozeLabel.style.lineHeight = '1.2';
    floatingSnoozeLabel.style.whiteSpace = 'nowrap';
    floatingContainer.appendChild(floatingSnoozeLabel);

    const floatingTimerLabel = document.createElement('div');
    floatingTimerLabel.style.display = 'none';
    floatingTimerLabel.style.marginLeft = '1px';
    floatingTimerLabel.style.padding = '3px 7px';
    floatingTimerLabel.style.borderRadius = '999px';
    floatingTimerLabel.style.background = '#ffffff';
    floatingTimerLabel.style.border = '1px solid #c8dbf2';
    floatingTimerLabel.style.boxShadow = '0 2px 5px rgba(0,0,0,0.12)';
    floatingTimerLabel.style.color = '#1f4e79';
    floatingTimerLabel.style.fontSize = '11px';
    floatingTimerLabel.style.fontWeight = '700';
    floatingTimerLabel.style.lineHeight = '1.2';
    floatingTimerLabel.style.whiteSpace = 'nowrap';
    floatingContainer.appendChild(floatingTimerLabel);

    // Global Timer State
    let globalTimerEndMs = null;
    let updateGlobalTimerUi = null;
    let globalTimerNotified = false;
    const savedTimer = localStorage.getItem('PA_GLOBAL_TIMER');
    if (savedTimer) {
        const parsed = parseInt(savedTimer, 10);
        if (parsed > Date.now()) globalTimerEndMs = parsed;
        else localStorage.removeItem('PA_GLOBAL_TIMER');
    }

    document.body.appendChild(floatingContainer);
    // Panel
    const panel = document.createElement('div');
    panel.className = 'bm-panel';
    Object.assign(panel.style, {
        top: '100px',
        right: '20px',
        width: '280px',
        display: 'none',
        flexDirection: 'column',
        height: '420px', // set a default height
        minHeight: '150px',
        maxHeight: '80vh',
        position: 'fixed',
    });
    panel.style.position = 'fixed';
    const PANEL_MIN_WIDTH = 460;
    panel.style.minWidth = PANEL_MIN_WIDTH + 'px';
    panel.style.maxHeight = '80vh';
    panel.style.height = panel.style.height || '420px';
    panel.style.overflow = 'hidden';
    panel.style.display = 'flex'; // ensure flex

    const PANEL_OFFSET = 8;
    function updatePanelPosition() {
        const rect = floatingButton.getBoundingClientRect();
        if (rect && Number.isFinite(rect.bottom)) {
            panel.style.top = `${Math.round(rect.bottom + PANEL_OFFSET)}px`;
            return;
        }
        const floatingTop = parseInt(floatingContainer.style.top, 10);
        if (!Number.isNaN(floatingTop)) {
            panel.style.top = `${floatingTop + 30}px`;
        }
    }

    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);

    const resizeHandle = document.createElement('div');
    Object.assign(resizeHandle.style, {
        width: '16px',
        height: '16px',
        position: 'absolute',
        left: '0',
        bottom: '0',
        cursor: 'nesw-resize',
        zIndex: '10002',
        background: 'transparent'
    });
    panel.appendChild(resizeHandle);

    const resetPanelAutoCloseOnActivity = () => {
        if (!isPanelListViewActive()) {
            clearPanelAutoClose();
            return;
        }
        schedulePanelAutoClose();
    };
    ['mousedown', 'keydown', 'input', 'focusin', 'wheel', 'touchstart'].forEach((evt) => {
        panel.addEventListener(evt, resetPanelAutoCloseOnActivity);
    });
    panel.addEventListener('mouseenter', () => {
        clearPanelAutoClose();
    });
    panel.addEventListener('mouseleave', () => {
        if (panel.style.display !== 'none' && !isAnyBmModalOpen()) {
            schedulePanelAutoClose();
        }
    });

    const modalObserver = new MutationObserver((mutations) => {
        let touchedModal = false;
        for (const mutation of mutations) {
            const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
            for (const node of nodes) {
                if (!node || node.nodeType !== 1) continue;
                if (node.id === 'bm-barcode-zoom-modal' || node.classList?.contains('bm-modal')) {
                    touchedModal = true;
                    break;
                }
                if (node.querySelector?.('#bm-barcode-zoom-modal, .bm-modal')) {
                    touchedModal = true;
                    break;
                }
            }
            if (touchedModal) break;
        }
        if (!touchedModal) return;

        if (isAnyBmModalOpen()) {
            clearPanelAutoClose();
            if (!document.querySelector('.bm-modal[data-no-autoclose="1"]')) {
                scheduleModalAutoClose();
            } else {
                clearModalAutoClose();
            }
            return;
        }
        clearModalAutoClose();
        if (isPanelListViewActive()) {
            schedulePanelAutoClose();
        } else {
            clearPanelAutoClose();
        }
    });
    modalObserver.observe(document.body, { childList: true, subtree: true });

    let isResizing = false;
    let startX, startY, startWidth, startHeight;

    // Restore panel size from storage if exists
    const savedPanelSize = gmGet(STORAGE_KEYS.PANEL_SIZE, null);
    if (savedPanelSize && savedPanelSize.width && savedPanelSize.height) {
        panel.style.width = savedPanelSize.width + 'px';
        panel.style.height = savedPanelSize.height + 'px';
    }

    resizeHandle.addEventListener('mousedown', function (e) {
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = parseInt(document.defaultView.getComputedStyle(panel).width, 10);
        startHeight = parseInt(document.defaultView.getComputedStyle(panel).height, 10);
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!isResizing) return;
        let newWidth = startWidth - (e.clientX - startX);
        let newHeight = startHeight + (e.clientY - startY);
        if (newWidth < PANEL_MIN_WIDTH) newWidth = PANEL_MIN_WIDTH;
        if (newHeight < 135) newHeight = 135;
        panel.style.width = newWidth + 'px';
        panel.style.height = newHeight + 'px';
        // Save panel size to storage on resize
        gmSet(STORAGE_KEYS.PANEL_SIZE, { width: newWidth, height: newHeight });
    });

    document.addEventListener('mouseup', function () {
        if (isResizing) {
            isResizing = false;
            document.body.style.userSelect = '';
        }
    });

    // Only create the hamburger button once (same as previous code)
    const menuButton = document.createElement('button');
    menuButton.textContent = '✚';
    menuButton.className = 'bm-button bm-menu-button';
    Object.assign(menuButton.style, {
        fontSize: '18px',
        padding: '0',
        background: 'none',
        border: 'none',
        outline: 'none',
        cursor: 'pointer'
    });
    menuButton.addEventListener('click', toggleDropdown);

    // Create three-column header
    const topControls = document.createElement('div');
    Object.assign(topControls.style, {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '2px',
        marginTop: '2px',
        width: '100%',
        gap: '0'
    });

    // Add hamburger button as the first column of the header
    topControls.appendChild(menuButton);

    // Home button next to +
    const homeHeaderButton = document.createElement('button');
    homeHeaderButton.textContent = '🏠';
    homeHeaderButton.className = 'bm-button';
    Object.assign(homeHeaderButton.style, {
        background: 'none',
        border: 'none',
        outline: 'none',
        cursor: 'pointer',
        padding: '4px 8px',
        fontSize: '16px'
    });
    homeHeaderButton.title = 'Home';
    homeHeaderButton.addEventListener('click', () => {
        closeAllContextMenus();
        if (currentTabName === 'bookmarks') {
            bookmarkActiveFolder = null;
            bookmarkActiveSubFolder = null;
            bookmarkFormWrapper.innerHTML = '';
            bookmarkFormWrapper.style.display = 'none';
            bookmarkDisplay.style.display = 'flex';
            renderBookmarks();
            return;
        }
        activeFolder = null;
        selectedBarcodeIds.clear();
        formWrapper.innerHTML = '';
        formWrapper.style.display = 'none';
        folderDisplay.style.display = 'flex';
        switchTab('barcode');
        renderFolders();
    });
    topControls.appendChild(homeHeaderButton);

    // Middle column: title
    const title = document.createElement('div');
    title.textContent = 'PA';
    Object.assign(title.style, {
        fontSize: '16px',
        fontWeight: 'bold',
        textAlign: 'center',
        flex: '1 0 auto',
        userSelect: 'none'
    });
    topControls.appendChild(title);

    // Third column: settings button (gear)
    const settingsButton = document.createElement('button');
    settingsButton.textContent = '⚙️';
    settingsButton.className = 'bm-button';
    Object.assign(settingsButton.style, {
        background: 'none',
        border: 'none',
        outline: 'none',
        cursor: 'pointer',
        padding: '4px 8px',
        fontSize: '18px'
    });

    // Clipboard send button
    const clipboardSendButton = document.createElement('button');
    clipboardSendButton.textContent = '📤';
    clipboardSendButton.className = 'bm-button';
    Object.assign(clipboardSendButton.style, {
        background: 'none',
        border: 'none',
        outline: 'none',
        cursor: 'pointer',
        padding: '4px 8px',
        fontSize: '16px'
    });
    clipboardSendButton.title = '📤 Pastes clipboard like scanner input';
    clipboardSendButton.addEventListener('click', () => runActionWithFeedback(clipboardSendButton, () => sendClipboardToPage()));
    topControls.appendChild(clipboardSendButton);

    settingsButton.onclick = null;

    let settingsDropdown = null;

    function closeSettingsDropdown() {
        if (settingsDropdown && document.body.contains(settingsDropdown)) {
            settingsDropdown.remove();
            settingsDropdown = null;
        }
    }

    function showPrintServerModal() {
        closeSettingsDropdown();
        const existing = document.getElementById('bm-print-server-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'bm-print-server-modal';
        modal.className = 'bm-modal';
        modal.dataset.noAutoclose = '1';
        Object.assign(modal.style, {
            padding: '12px',
            minWidth: '260px',
            zIndex: '10002'
        });

        const header = document.createElement('div');
        header.className = 'bm-header';
        header.textContent = 'Print Server';
        header.style.fontSize = '14px';
        header.style.marginBottom = '6px';

        const hint = document.createElement('div');
        hint.className = 'bm-text';
        hint.textContent = 'Enter host:port or full URL. Leave empty to use default.';
        hint.style.fontSize = '10px';
        hint.style.color = '#666';
        hint.style.marginBottom = '6px';

        const overrideLabel = document.createElement('div');
        overrideLabel.className = 'bm-text';
        overrideLabel.textContent = 'Override';
        overrideLabel.style.fontSize = '10px';
        overrideLabel.style.color = '#666';
        overrideLabel.style.marginBottom = '4px';

        const input = document.createElement('input');
        input.className = 'bm-input';
        input.placeholder = `host:port(e.g. ${DEFAULT_PRINT_HOST}:${DEFAULT_PRINT_PORT})`;
        input.value = getPrintServerOverride();

        const buttonsRow = document.createElement('div');
        Object.assign(buttonsRow.style, {
            display: 'flex',
            gap: '8px',
            marginTop: '10px',
            justifyContent: 'center'
        });

        const saveBtn = document.createElement('button');
        saveBtn.className = 'bm-button';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', () => {
            const value = String(input.value || '').trim();
            setPrintServerOverride(value);
            if (!value) {
                showFlash('Print server override cleared', false, 'success');
            } else {
                showFlash('Print server override saved', false, 'success');
            }
            modal.remove();
        });

        const clearBtn = document.createElement('button');
        clearBtn.className = 'bm-button';
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', () => {
            setPrintServerOverride('');
            showFlash('Print server override cleared', false, 'success');
            modal.remove();
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => modal.remove());

        buttonsRow.append(saveBtn, clearBtn, cancelBtn);
        modal.append(header, hint, overrideLabel, input, buttonsRow);
        panel.appendChild(modal);
        wireModalIdleTracking(modal);

        input.focus();
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                modal.remove();
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                saveBtn.click();
            }
        });
    }

    function formatWorkspaceStateValue(value) {
        const raw = String(value || '').replace(/_/g, ' ').toLowerCase();
        return raw ? raw.replace(/\b\w/g, ch => ch.toUpperCase()) : 'Unknown';
    }

    function formatWorkspaceDate(value) {
        if (!value) return 'Never';
        try {
            return new Date(value).toLocaleString();
        } catch {
            return String(value);
        }
    }

    function getWorkspaceBrowserKind() {
        const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
        if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
        if (/Chrome|Chromium|Edg\//i.test(ua)) return 'chromium';
        return 'other';
    }

    function getWorkspaceBrowserMessage() {
        const kind = getWorkspaceBrowserKind();
        if (kind === 'chromium') {
            return '☁ Workspace (Experimental)\n✔ Automatic Workspace\n✔ OneDrive Integration\n✔ Cloud Backup';
        }
        if (kind === 'firefox') {
            return '☁ Workspace\nThis feature is currently available in Chromium-based browsers.\nYour data is still safely stored locally.\nYou can always use Import/Export.';
        }
        return '☁ Workspace\nThis feature requires a Chromium-based browser with File System Access API support.\nYour data is still safely stored locally.\nYou can always use Import/Export.';
    }

    function getWorkspaceOneDriveGuidance() {
        return 'Cloud backup: choose OneDrive.\nOther folders stay local only.';
    }

    function createWorkspaceSettingsSection() {
        const section = document.createElement('div');
        section.className = 'bm-workspace-settings';
        Object.assign(section.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: '6px',
            marginBottom: '4px',
            borderBottom: '1px solid rgba(0,0,0,0.12)',
            minWidth: '220px',
            whiteSpace: 'normal'
        });

        const title = document.createElement('div');
        title.className = 'bm-text';
        title.textContent = 'Workspace';
        Object.assign(title.style, {
            fontSize: '12px',
            fontWeight: 'bold',
            color: '#333',
            marginBottom: '2px'
        });

        const browserMessage = document.createElement('div');
        browserMessage.className = 'bm-text';
        browserMessage.textContent = getWorkspaceBrowserMessage();
        Object.assign(browserMessage.style, {
            whiteSpace: 'pre-line',
            fontSize: '11px',
            lineHeight: '1.35',
            color: getWorkspaceBrowserKind() === 'firefox' ? '#8a5a00' : '#2f6f3e',
            background: getWorkspaceBrowserKind() === 'firefox' ? '#fff8e1' : '#eef9f0',
            border: getWorkspaceBrowserKind() === 'firefox' ? '1px solid #f2d28a' : '1px solid #b7dfbd',
            borderRadius: '6px',
            padding: '6px',
            marginBottom: '4px'
        });

        const oneDriveGuidance = document.createElement('div');
        oneDriveGuidance.className = 'bm-text';
        oneDriveGuidance.textContent = getWorkspaceOneDriveGuidance();
        Object.assign(oneDriveGuidance.style, {
            fontSize: '10.5px',
            lineHeight: '1.35',
            color: '#6b4d00',
            background: '#fff8df',
            border: '1px solid #eed082',
            borderRadius: '6px',
            padding: '6px',
            marginBottom: '4px'
        });

        const rows = {};
        const makeRow = (label) => {
            const row = document.createElement('div');
            row.className = 'bm-text';
            Object.assign(row.style, {
                display: 'flex',
                justifyContent: 'space-between',
                gap: '8px',
                fontSize: '11px',
                color: '#444'
            });
            const labelEl = document.createElement('span');
            labelEl.textContent = label;
            labelEl.style.fontWeight = '600';
            const valueEl = document.createElement('span');
            valueEl.textContent = '—';
            valueEl.style.textAlign = 'right';
            valueEl.style.maxWidth = '130px';
            valueEl.style.overflow = 'hidden';
            valueEl.style.textOverflow = 'ellipsis';
            valueEl.title = '';
            row.append(labelEl, valueEl);
            rows[label] = valueEl;
            return row;
        };

        const statusRow = makeRow('Status');
        const supportedRow = makeRow('Supported Browser');
        const folderRow = makeRow('Selected Folder');
        const permissionRow = makeRow('Permission');
        const lastSaveRow = makeRow('Last Save');
        const autoBackupRow = makeRow('Auto Backup');
        const restoreRow = makeRow('Restore');

        const buttonRow = document.createElement('div');
        Object.assign(buttonRow.style, {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px',
            marginTop: '4px'
        });

        const makeButton = (label) => {
            const btn = document.createElement('button');
            btn.className = 'bm-button';
            btn.textContent = label;
            btn.style.fontSize = '11px';
            btn.style.whiteSpace = 'nowrap';
            return btn;
        };

        const connectBtn = makeButton('Connect');
        connectBtn.title = getWorkspaceOneDriveGuidance();
        const disconnectBtn = makeButton('Disconnect');
        const saveBtn = makeButton('Save Now');
        const restoreBtn = makeButton('Restore');
        const refreshBtn = makeButton('Refresh Status');

        buttonRow.append(connectBtn, disconnectBtn, saveBtn, restoreBtn, refreshBtn);
        section.append(title, browserMessage, oneDriveGuidance, statusRow, supportedRow, folderRow, permissionRow, lastSaveRow, autoBackupRow, restoreRow, buttonRow);

        const setBusy = (busy) => {
            [connectBtn, disconnectBtn, saveBtn, restoreBtn, refreshBtn].forEach(btn => {
                btn.disabled = !!busy;
                btn.style.opacity = busy ? '0.65' : '';
            });
        };

        const update = () => {
            const state = WorkspaceService.getState();
            browserMessage.textContent = getWorkspaceBrowserMessage();
            rows.Status.textContent = formatWorkspaceStateValue(state.state);
            rows['Supported Browser'].textContent = state.supported ? 'Yes' : 'No';
            rows['Selected Folder'].textContent = state.selectedFolder || 'None';
            rows['Selected Folder'].title = state.selectedFolder || '';
            rows.Permission.textContent = formatWorkspaceStateValue(state.permission || 'unknown');
            rows['Last Save'].textContent = formatWorkspaceDate(state.lastSaveAt);
            rows['Last Save'].title = state.lastSavePath || '';
            if (state.snapshotInProgress) {
                rows['Auto Backup'].textContent = 'Saving...';
                rows['Auto Backup'].title = 'Automatic snapshot is being written now.';
            } else if (state.snapshotDueAt) {
                rows['Auto Backup'].textContent = `${state.snapshotDirty ? 'Pending' : 'Next'} ${formatWorkspaceDate(state.snapshotDueAt)}`;
                rows['Auto Backup'].title = `Next automatic snapshot is scheduled for ${state.snapshotDueAt}`;
            } else if (state.lastSnapshotAt) {
                rows['Auto Backup'].textContent = `${formatWorkspaceDate(state.lastSnapshotAt)} (${state.snapshotCount || 0}/${state.maxSnapshots || 10})`;
                rows['Auto Backup'].title = state.lastSnapshotPath || '';
            } else {
                rows['Auto Backup'].textContent = `Every ${Math.round((state.snapshotIntervalMs || 600000) / 60000)} min, max ${state.maxSnapshots || 10}`;
                rows['Auto Backup'].title = 'Automatic snapshots are saved to PA/backups after data changes when Workspace is connected and permission is granted.';
            }
            rows.Restore.textContent = 'Manual';

            const hasWorkspace = state.state !== WorkspaceState.DISCONNECTED && !!state.selectedFolder;
            connectBtn.disabled = !state.supported || hasWorkspace;
            disconnectBtn.disabled = !hasWorkspace;
            saveBtn.disabled = !state.supported || !hasWorkspace;
            restoreBtn.disabled = !state.supported || !hasWorkspace;
            refreshBtn.disabled = !state.supported;
        };

        let workspaceUpdateQueued = false;
        WorkspaceService.on('*', () => {
            if (workspaceUpdateQueued) return;
            workspaceUpdateQueued = true;
            const runUpdate = () => {
                workspaceUpdateQueued = false;
                update();
            };
            if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                window.requestAnimationFrame(runUpdate);
            } else {
                setTimeout(runUpdate, 0);
            }
        });

        connectBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            bmConfirm(`${getWorkspaceOneDriveGuidance()}\n\nContinue and choose your OneDrive folder now?`, async (ok) => {
                if (!ok) return;
                setBusy(true);
                const result = await WorkspaceService.connect();
                setBusy(false);
                update();
                if (result?.state === WorkspaceState.ERROR || result?.error) {
                    showFlash(result?.error?.message || 'Workspace connect failed', true, 'error');
                } else {
                    showFlash('Workspace connected. Cloud backup works only if this folder is inside OneDrive.', false, 'success');
                }
            });
        });

        disconnectBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            setBusy(true);
            await WorkspaceService.disconnect({ clearPersistedHandle: true });
            setBusy(false);
            update();
            showFlash('Workspace disconnected', false, 'success');
        });

        saveBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            setBusy(true);
            const result = await WorkspaceService.saveNow();
            setBusy(false);
            update();
            if (result?.ok) {
                showFlash(`Workspace saved: ${result.path}`, false, 'success');
            } else {
                showFlash(result?.error?.message || 'Workspace save failed', true, 'error');
            }
        });

        restoreBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            bmConfirm('Restore data from PA/workspace.pa? Existing import merge rules will be used.', async (ok) => {
                if (!ok) return;
                setBusy(true);
                const result = await WorkspaceService.restoreNow();
                setBusy(false);
                update();
                if (result?.ok) {
                    showFlash(`Workspace restored: ${result.path}`, false, 'success');
                } else {
                    showFlash(result?.error?.message || 'Workspace restore failed', true, 'error');
                }
            });
        });

        refreshBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            setBusy(true);
            const result = await WorkspaceService.refreshStatus();
            setBusy(false);
            update();
            if (!result?.ok && result?.error) {
                showFlash(result.error.message || 'Workspace refresh failed', true, 'error');
            } else if (result?.reason === 'unsupported') {
                showFlash('Workspace is not supported in this browser', true, 'error');
            } else if (!result?.connected) {
                showFlash('Workspace status refreshed: not connected', false, 'info');
            } else {
                const cleanupText = result?.emptyCleanup?.deleted ? `, removed ${result.emptyCleanup.deleted} empty backup(s)` : '';
                showFlash(`Workspace refreshed: ${formatWorkspaceStateValue(result.permission || 'unknown')}, backups ${result.snapshots || 0}${cleanupText}`, false, 'success');
            }
        });

        update();
        if (WorkspaceService.isSupported() && !WorkspaceService.getState().selectedFolder) {
            setBusy(true);
            WorkspaceService.initialize()
                .then(update)
                .catch(err => WorkspaceDiagnostics.warn('Workspace settings initialization failed.', err))
                .finally(() => {
                    setBusy(false);
                    update();
                });
        }
        return section;
    }

    settingsButton.onclick = function (e) {
        e.stopPropagation();
        if (isAnyBmModalOpen()) return;
        closeSearchUI();
        if (settingsDropdown && document.body.contains(settingsDropdown)) {
            closeSettingsDropdown();
            return;
        }
        document.querySelectorAll('.bm-settings-dropdown').forEach(el => el.remove());

        settingsDropdown = document.createElement('div');
        settingsDropdown.className = 'bm-menu bm-settings-dropdown';
        settingsDropdown.style.display = 'flex';
        settingsDropdown.style.flexDirection = 'column';
        settingsDropdown.style.position = 'fixed';
        settingsDropdown.style.zIndex = 10002;
        settingsDropdown.style.minWidth = '240px';
        settingsDropdown.style.padding = '4px';
        settingsDropdown.style.fontSize = '12px';
        settingsDropdown.style.lineHeight = '1.2';
        settingsDropdown.style.whiteSpace = 'nowrap';

        // Import option
        const importBtn = document.createElement('button');
        importBtn.textContent = 'Import File';
        importBtn.className = 'bm-button';
        importBtn.style.fontSize = '12px';
        importBtn.style.whiteSpace = 'nowrap';
        importBtn.onclick = function () {
            closeSettingsDropdown();
            showImportModal();
        };

        // Export option
        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'Export File';
        exportBtn.className = 'bm-button';
        exportBtn.style.fontSize = '12px';
        exportBtn.style.whiteSpace = 'nowrap';
        exportBtn.onclick = async function () {
            closeSettingsDropdown();
            try {
                const data = await buildFullBackupData();
                const buffer = await serializeWorkspaceData(data);
                const blob = new Blob([buffer], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const dateStr = new Date().toISOString().split('T')[0];
                a.download = `Workspace_${dateStr}.pa`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    a.remove();
                    URL.revokeObjectURL(url);
                }, 1000);
            } catch (err) {
                WorkspaceDiagnostics.warn('Export failed', err);
                showFlash('Failed to export workspace', true, 'error');
            }
        };

        const printServerBtn = document.createElement('button');
        printServerBtn.textContent = 'Print Server';
        printServerBtn.className = 'bm-button';
        printServerBtn.style.fontSize = '12px';
        printServerBtn.style.whiteSpace = 'nowrap';
        printServerBtn.onclick = function () {
            showPrintServerModal();
        };

        const wellnessBtn = document.createElement('button');
        wellnessBtn.textContent = 'Wellness';
        wellnessBtn.className = 'bm-button';
        wellnessBtn.style.fontSize = '12px';
        wellnessBtn.style.whiteSpace = 'nowrap';
        wellnessBtn.onclick = function () {
            showWellnessSettingsModal();
        };

        let printLogBtn = null;
        if (PRINT_LOG?.enabled && typeof PRINT_LOG.showModal === 'function') {
            printLogBtn = document.createElement('button');
            printLogBtn.textContent = 'Print Log';
            printLogBtn.className = 'bm-button';
            printLogBtn.style.fontSize = '12px';
            printLogBtn.style.whiteSpace = 'nowrap';
            printLogBtn.onclick = function () {
                PRINT_LOG.showModal();
            };
        }

        // Reset option
        const resetBtn = document.createElement('button');
        resetBtn.textContent = 'Reset Data';
        resetBtn.className = 'bm-button';
        resetBtn.style.fontSize = '12px';
        resetBtn.style.whiteSpace = 'nowrap';
        resetBtn.onclick = function () {
            closeSettingsDropdown();

            bmConfirm('Are you sure you want to delete all PA data?', async (result) => {
                if (result) {
                    gmSet(STORAGE_KEYS.FOLDERS, []);
                    gmSet(STORAGE_KEYS.BARCODES, []);
                    gmSet(STORAGE_KEYS.SUBFOLDERS, []);
                    setFoldersCache([]);
                    setBarcodesCache([]);
                    gmSet(BOOKMARKS_KEY, []);
                    gmSet(BOOKMARK_FOLDERS_KEY, []);
                    gmSet(BOOKMARK_SUBFOLDERS_KEY, []);
                    gmSet(BOOKMARK_DEFAULTS_MIGRATION_KEY, true);
                    NoteService.saveNotes([]);
                    NoteService.saveNoteFolders([]);
                    saveTasks([]);
                    saveTodoProjects([]);
                    gmSet(WELLNESS_SETTINGS_KEY, null);
                    gmSet(PRINT_SERVER_OVERRIDE_KEY, '');
                    gmSet(PRINT_LOG_KEY, []);
                    activeFolder = null;
                    activeSubFolder = null;
                    bookmarkActiveFolder = null;
                    bookmarkActiveSubFolder = null;
                    activeNoteId = null;
                    await refreshPanelAfterDataMutation();
                    showFlash('All data reset', false, 'success');
                }
            });
        };

        const workspaceSection = createWorkspaceSettingsSection();

        settingsDropdown.append(workspaceSection, importBtn, exportBtn, printServerBtn, wellnessBtn);
        if (printLogBtn) settingsDropdown.append(printLogBtn);
        settingsDropdown.append(resetBtn);
        document.body.appendChild(settingsDropdown);

        setTimeout(() => {
            if (!settingsDropdown) return;
            const btnRect = settingsButton.getBoundingClientRect();
            const menuRect = settingsDropdown.getBoundingClientRect();
            const targetRight = btnRect.left + (btnRect.width / 2);
            const rawLeft = targetRight - menuRect.width;
            const left = Math.max(4, Math.min(window.innerWidth - menuRect.width - 4, rawLeft));
            const top = Math.max(4, Math.min(window.innerHeight - menuRect.height - 4, btnRect.bottom));
            settingsDropdown.style.left = `${left}px`;
            settingsDropdown.style.top = `${top}px`;
        }, 0);

        function closeDropdownOnClick(event) {
            if (settingsDropdown && !settingsDropdown.contains(event.target) && event.target !== settingsButton) {
                closeSettingsDropdown();
                document.removeEventListener('click', closeDropdownOnClick);
            }
        }
        setTimeout(() => {
            document.addEventListener('click', closeDropdownOnClick);
        }, 0);
    };

    // --- Search Button & Input ---
    let searchActive = false;
    let searchInput = null;
    let barcodeSearchQuery = '';

    const searchHost = document.createElement('div');
    Object.assign(searchHost.style, {
        display: 'none',
        flexDirection: 'column',
        width: '100%',
        margin: '4px 0 2px 0',
        gap: '4px'
    });
    panel.appendChild(searchHost);

    const searchButton = document.createElement('button');
    searchButton.textContent = '🔍';
    searchButton.className = 'bm-button';
    searchButton.style.fontSize = '18px';
    searchButton.style.marginLeft = '8px';

    function showSearchHost(node) {
        searchHost.innerHTML = '';
        if (node) {
            searchHost.appendChild(node);
            searchHost.style.display = 'flex';
        } else {
            searchHost.style.display = 'none';
        }
    }

    async function renderBarcodeSearchResults(query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) {
            renderFolders();
            return;
        }
        const folders = await getFolders();
        const barcodes = await getBarcodes();

        const matchedFolders = folders.filter(f =>
            f.name.toLowerCase().includes(q)
        );
        const matchedBarcodes = barcodes.filter(b =>
            (b.name && b.name.toLowerCase().includes(q)) ||
            (b.value && b.value.toLowerCase().includes(q))
        );

        folderDisplay.innerHTML = '';

        if (matchedFolders.length > 0) {
            const folderTitle = document.createElement('div');
            folderTitle.textContent = 'Folders:';
            folderTitle.style.fontWeight = 'bold';
            folderTitle.style.margin = '8px 0 4px 0';
            folderDisplay.appendChild(folderTitle);

            matchedFolders.forEach(folder => {
                const div = document.createElement('div');
                div.className = 'bm-folder-icon-wrapper';
                div.style.margin = '4px 8px';
                div.style.cursor = 'pointer';

                const icon = document.createElement('div');
                icon.className = 'bm-folder-icon';
                icon.innerHTML = `
                <svg width="36" height="36" viewBox="0 0 491.52 491.52">
                <g>
                <path style="fill:#F6C358;" d="M445.522,88.989h-259.23c-5.832,0-11.24-3.318-14.26-8.749l-13.88-24.957
                c-3.021-5.432-8.427-8.749-14.259-8.749H45.998c-9.208,0-16.671,8.126-16.671,18.15v362.151c0,10.024,7.463,18.15,16.671,18.15
                h399.523c9.207,0,16.671-8.126,16.671-18.15V107.14C462.192,97.116,454.728,88.989,445.522,88.989z"/>
                <rect x="55.383" y="133.12" style="fill:#F6C358;" width="385.536" height="122.092"/>
                <rect x="55.383" y="150.17" style="fill:#F6C358;" width="385.536" height="122.092"/>
                <path style="fill:#FCD462;" d="M474.806,216.429H16.714c-10.557,0-17.956,8.348-16.541,18.538l27.158,195.639
                c1.107,7.974,9.46,14.379,18.667,14.379h399.523c9.207,0,17.56-6.405,18.667-14.379l27.158-195.639
                C492.761,224.777,485.362,216.429,474.806,216.429z"/>
                </g>
                </svg>
                `;
                div.appendChild(icon);

                const label = document.createElement('div');
                label.textContent = folder.name;
                label.className = 'bm-text bm-folder-label';
                label.title = folder.name;
                div.appendChild(label);

                div.onclick = async (e) => {
                    e.stopPropagation();
                    activeFolder = folder.name;
                    renderFolders();

                    closeSearchUI();
                };
                folderDisplay.appendChild(div);
            });
        }

        if (matchedBarcodes.length > 0) {
            const barcodeTitle = document.createElement('div');
            barcodeTitle.textContent = 'Barcodes:';
            barcodeTitle.style.fontWeight = 'bold';
            barcodeTitle.style.margin = '8px 0 4px 0';
            folderDisplay.appendChild(barcodeTitle);

            matchedBarcodes.forEach(b => {
                const div = document.createElement('div');
                div.className = 'bm-barcode-item';
                div.style.margin = '4px 8px';
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.gap = '6px';
                div.style.cursor = 'pointer';

                const barcodeIcon = document.createElement('span');
                barcodeIcon.innerHTML = `
            <svg width="32" height="18" viewBox="0 0 32 18">
            <rect x="0" y="0" width="2" height="18" fill="#222"/>
            <rect x="4" y="0" width="1" height="18" fill="#222"/>
            <rect x="7" y="0" width="2" height="18" fill="#222"/>
            <rect x="11" y="0" width="1" height="18" fill="#222"/>
            <rect x="14" y="0" width="3" height="18" fill="#222"/>
            <rect x="19" y="0" width="1" height="18" fill="#222"/>
            <rect x="22" y="0" width="2" height="18" fill="#222"/>
            <rect x="26" y="0" width="1" height="18" fill="#222"/>
            <rect x="29" y="0" width="2" height="18" fill="#222"/>
            </svg>
            `;
                div.appendChild(barcodeIcon);

                const nameDiv = document.createElement('div');
                nameDiv.style.fontWeight = 'bold';
                nameDiv.textContent = b.name || '';
                div.appendChild(nameDiv);

                div.onclick = async (e) => {
                    e.stopPropagation();
                    activeFolder = b.folder;
                    closeSearchUI();
                    await renderFolders();

                    setTimeout(() => {
                        const barcodeElems = panel.querySelectorAll('.bm-barcode-item');
                        for (const el of barcodeElems) {

                            const nameElem = el.querySelector('span,div');
                            if (nameElem && nameElem.textContent.trim() === (b.name || '').trim()) {
                                el.style.background = '#ffe082';
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                setTimeout(() => { el.style.background = ''; }, 2000);
                                break;
                            }
                        }
                    }, 100);
                };
                folderDisplay.appendChild(div);
            });
        }

        if (matchedFolders.length + matchedBarcodes.length === 0) {
            folderDisplay.innerHTML = `<div style="text-align:center;color:#888;margin:12px 0;">No results found.</div>`;
        }
    }

    function openBarcodeSearchUI(shouldFocus = true) {
        searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search folders or barcodes...';
        searchInput.className = 'bm-input';
        searchInput.style.margin = '0';
        searchInput.style.width = '100%';
        searchInput.style.display = 'block';
        searchInput.style.zIndex = 10010;
        searchInput.value = barcodeSearchQuery;

        showSearchHost(searchInput);
        if (shouldFocus) {
            searchInput.focus();
            searchInput.select();
        }

        searchInput.addEventListener('input', async function () {
            barcodeSearchQuery = searchInput.value.trim();
            await renderBarcodeSearchResults(barcodeSearchQuery);
        });

        searchInput.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                closeSearchUI();
                renderFolders();
            }
        });

        if (barcodeSearchQuery) {
            renderBarcodeSearchResults(barcodeSearchQuery);
        }
    }

    function openTodoSearchUI(shouldFocus = true) {
        searchFilterBar.style.marginBottom = '0';
        showSearchHost(searchFilterBar);
        if (shouldFocus) {
            taskSearch.focus();
            taskSearch.select();
        }
    }

    function openBookmarkSearchUI(shouldFocus = true) {
        searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search bookmarks...';
        searchInput.className = 'bm-input';
        searchInput.style.margin = '0';
        searchInput.style.width = '100%';
        searchInput.style.display = 'block';
        searchInput.style.zIndex = 10010;
        searchInput.value = bookmarkSearchQuery;
        showSearchHost(searchInput);
        if (shouldFocus) {
            searchInput.focus();
            searchInput.select();
        }
        searchInput.addEventListener('input', () => {
            bookmarkSearchQuery = searchInput.value.trim();
            renderBookmarks();
        });
        searchInput.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                closeSearchUI();
                renderBookmarks();
            }
        });
    }

    function openNoteSearchUI(shouldFocus = true) {
        searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search notes...';
        searchInput.className = 'bm-input';
        searchInput.style.margin = '0';
        searchInput.style.width = '100%';
        searchInput.style.display = 'block';
        searchInput.style.zIndex = 10010;
        searchInput.value = noteSearchQuery;
        showSearchHost(searchInput);
        if (shouldFocus) {
            searchInput.focus();
            searchInput.select();
        }
        searchInput.addEventListener('input', () => {
            noteSearchQuery = searchInput.value.trim();
            renderNotes();
        });
        searchInput.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                closeSearchUI();
                renderNotes();
            }
        });
    }

    function closeSearchUI() {
        if (searchInput) searchInput.remove();
        searchInput = null;
        searchActive = false;
        searchHost.innerHTML = '';
        searchHost.style.display = 'none';
        barcodeSearchQuery = '';
        bookmarkSearchQuery = '';
        noteSearchQuery = '';
        searchButton.textContent = '🔍';
    }

    async function refreshPanelAfterDataMutation() {
        closeSearchUI();
        closeAllContextMenus();
        closeOpenFolderMenu();

        if (typeof selectedBarcodeIds !== 'undefined' && selectedBarcodeIds && typeof selectedBarcodeIds.clear === 'function') {
            selectedBarcodeIds.clear();
        }
        if (typeof selectedBookmarkIds !== 'undefined' && selectedBookmarkIds && typeof selectedBookmarkIds.clear === 'function') {
            selectedBookmarkIds.clear();
        }

        if (typeof formWrapper !== 'undefined' && formWrapper) {
            formWrapper.innerHTML = '';
            formWrapper.style.display = 'none';
        }
        if (typeof folderDisplay !== 'undefined' && folderDisplay) {
            folderDisplay.style.display = 'flex';
        }
        if (typeof bookmarkFormWrapper !== 'undefined' && bookmarkFormWrapper) {
            bookmarkFormWrapper.innerHTML = '';
            bookmarkFormWrapper.style.display = 'none';
        }
        if (typeof bookmarkDisplay !== 'undefined' && bookmarkDisplay) {
            bookmarkDisplay.style.display = 'flex';
        }
        if (typeof noteFormWrapper !== 'undefined' && noteFormWrapper) {
            noteFormWrapper.innerHTML = '';
            noteFormWrapper.style.display = 'none';
        }
        if (typeof noteDisplay !== 'undefined' && noteDisplay) {
            noteDisplay.style.display = 'flex';
        }

        // Refresh all tabs so switching tabs after import/reset never shows stale UI.
        await renderFolders();
        renderBookmarks();
        if (typeof renderNotes === 'function') {
            await renderNotes();
        }
        if (typeof renderTasksList === 'function') {
            await renderTasksList();
        }
        if (typeof updateTaskTabBadge === 'function') {
            updateTaskTabBadge();
        }
    }

    searchButton.onclick = function () {
        if (isAnyBmModalOpen()) return;
        if (searchActive) {
            const tabBeforeClose = currentTabName;
            closeSearchUI();
            if (tabBeforeClose === 'bookmarks') {
                renderBookmarks();
            } else if (tabBeforeClose === 'notes') {
                renderNotes();
            } else if (tabBeforeClose !== 'todo') {
                renderFolders();
            }
            return;
        }
        searchActive = true;
        searchButton.textContent = '✖';
        if (currentTabName === 'todo') {
            openTodoSearchUI();
        } else if (currentTabName === 'bookmarks') {
            openBookmarkSearchUI();
        } else if (currentTabName === 'notes') {
            openNoteSearchUI();
        } else {
            openBarcodeSearchUI();
        }
    };

    topControls.appendChild(searchButton);
    topControls.appendChild(settingsButton);

    // Only add to panel once
    if (!panel.querySelector('div[style*="display: flex"][style*="flex-direction: row"]')) {
        panel.insertBefore(topControls, panel.firstChild);
    }

    // ============================================================
    // SECTION: UI Containers and Runtime State
    // ------------------------------------------------------------
    // formWrapper, folderDisplay, activeFolder, selectedBarcodeIds,
    // and renderSeq are shared by forms, modals, and renderFolders.
    // ============================================================

    // Tab System Infrastructure
    const tabBar = document.createElement('div');
    tabBar.className = 'bm-tab-bar';
    panel.appendChild(tabBar);

    const tabContentContainer = document.createElement('div');
    Object.assign(tabContentContainer.style, {
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 auto',
        minHeight: '0',
        width: '100%',
    });
    panel.appendChild(tabContentContainer);

    const tabsMap = new Map();
    let currentTabName = 'barcode';

    switchTab = function (tabName) {
        currentTabName = tabName;
        tabsMap.forEach((tabInfo, name) => {
            if (name === tabName) {
                tabInfo.button.classList.add('active');
                tabInfo.content.style.setProperty('display', 'flex', 'important');
            } else {
                tabInfo.button.classList.remove('active');
                tabInfo.content.style.setProperty('display', 'none', 'important');
            }
        });
        if (searchActive) {
            if (tabName === 'todo') {
                openTodoSearchUI(false);
            } else if (tabName === 'bookmarks') {
                openBookmarkSearchUI(false);
            } else if (tabName === 'notes') {
                openNoteSearchUI(false);
            } else {
                openBarcodeSearchUI(false);
            }
        }
    };

    registerTab = function (name, label, contentElement) {
        const tabButton = document.createElement('button');
        tabButton.className = 'bm-tab';
        tabButton.textContent = label;
        tabButton.addEventListener('click', () => switchTab(name));

        tabBar.appendChild(tabButton);
        contentElement.classList.add('bm-tab-content');
        tabContentContainer.appendChild(contentElement);

        tabsMap.set(name, {
            button: tabButton,
            content: contentElement
        });

        // Set default display to none
        contentElement.style.setProperty('display', 'none', 'important');

        // If it's the first tab registered, make it active
        if (tabsMap.size === 1) {
            switchTab(name);
        }
    };

    // Expose to window for external/future plugin tab integrations
    window.bmRegisterTab = registerTab;
    window.bmSwitchTab = switchTab;

    const barcodeTabContent = document.createElement('div');
    Object.assign(barcodeTabContent.style, {
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 auto',
        minHeight: '0',
        width: '100%',
    });

    const formWrapper = document.createElement('div');
    // Make formWrapper flexible and scrollable, but hidden by default
    Object.assign(formWrapper.style, {
        flex: '0 0 auto',
        overflow: 'visible',
        minHeight: '0',
        display: 'none', // hidden by default
        flexDirection: 'column',
        justifyContent: 'flex-start',
    });
    barcodeTabContent.appendChild(formWrapper);

    const flashMessage = document.createElement('div');
    flashMessage.className = 'bm-flash';
    window._barcodeFlash = flashMessage;
    formWrapper.appendChild(flashMessage);

    const folderDisplay = document.createElement('div');
    Object.assign(folderDisplay.style, {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        overflow: 'auto',
        flex: '1 1 auto',
        minHeight: '0',
        maxHeight: '100%',
        alignContent: 'flex-start',
        justifyContent: 'flex-start',
    });
    barcodeTabContent.appendChild(folderDisplay);

    registerTab('barcode', '📊 Barcode', barcodeTabContent);

    const bookmarksTabContent = document.createElement('div');
    Object.assign(bookmarksTabContent.style, {
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 auto',
        minHeight: '0',
        width: '100%'
    });

    const bookmarkFormWrapper = document.createElement('div');
    Object.assign(bookmarkFormWrapper.style, {
        flex: '0 0 auto',
        overflow: 'visible',
        minHeight: '0',
        display: 'none',
        flexDirection: 'column',
        justifyContent: 'flex-start'
    });
    bookmarksTabContent.appendChild(bookmarkFormWrapper);

    const bookmarkDisplay = document.createElement('div');
    Object.assign(bookmarkDisplay.style, {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        overflow: 'auto',
        flex: '1 1 auto',
        minHeight: '0',
        maxHeight: '100%',
        alignContent: 'flex-start',
        justifyContent: 'flex-start'
    });
    bookmarksTabContent.appendChild(bookmarkDisplay);

    registerTab('bookmarks', '🔖 Bookmarks', bookmarksTabContent);

    function populateBookmarkDestinationSelect(select, preferredFolder = '', preferredSubFolder = '') {
        ensureBookmarkDefaults();
        const folders = getBookmarkFolders();
        select.innerHTML = '';
        folders.forEach(folder => {
            const folderOpt = document.createElement('option');
            folderOpt.value = `${folder.name}::`;
            folderOpt.textContent = `📁 ${folder.name}`;
            select.appendChild(folderOpt);

            const subs = getBookmarkSubFolders(folder.name);
            subs.forEach(sf => {
                const opt = document.createElement('option');
                opt.value = `${folder.name}::${sf.name}`;
                opt.textContent = `${String.fromCharCode(160).repeat(4)}📂 ${sf.name}`;
                select.appendChild(opt);
            });
        });
        const addOpt = document.createElement('option');
        addOpt.value = '__NEW__';
        addOpt.textContent = '➕ New folder...';

        if (folders.length === 0) {
            select.innerHTML = '';
            addOpt.selected = true;
            select.appendChild(addOpt);
            select.disabled = false;
            select.dataset.lastValid = '';
            select.dataset.noBookmarkFolders = '1';
            return;
        }
        select.appendChild(addOpt);
        select.disabled = false;
        select.dataset.noBookmarkFolders = '0';
        const target = preferredSubFolder ? `${preferredFolder}::${preferredSubFolder}` : `${preferredFolder || folders[0].name}::`;
        const exists = Array.from(select.options).some(o => o.value === target);
        select.value = exists ? target : (select.options[0]?.value || '');
        select.dataset.lastValid = select.value;
    }

    function parseBookmarkDestination(value) {
        const [folder, subfolder] = String(value || '').split('::');
        return {
            folder: folder || '',
            subfolder: subfolder || ''
        };
    }

    function openBookmarkFolderCreatorForSelect(select, fallbackValue = '') {
        if (select?.dataset?.creatingBookmarkFolder === '1') return;
        if (select) select.dataset.creatingBookmarkFolder = '1';
        const rawLastValid = fallbackValue || select?.dataset?.lastValid || '';
        const lastValid = rawLastValid === '__NEW__' ? '' : rawLastValid;
        if (select) {
            select.value = lastValid;
            select.disabled = true;
        }
        showNewFolderModal((name) => {
            if (select) {
                select.disabled = false;
                select.dataset.creatingBookmarkFolder = '0';
            }
            if (!name) {
                const previous = parseBookmarkDestination(lastValid);
                if (select) populateBookmarkDestinationSelect(select, previous.folder, previous.subfolder);
                return;
            }
            const ok = saveBookmarkFolder(name);
            const previous = parseBookmarkDestination(lastValid);
            if (select) {
                populateBookmarkDestinationSelect(select, ok ? name : previous.folder, '');
                if (ok) {
                    select.value = `${name}::`;
                    select.dataset.lastValid = select.value;
                }
            }
        });
    }

    function createBookmarkDestinationSelect(preferredFolder, preferredSubFolder) {
        const select = document.createElement('select');
        select.className = 'bm-input';
        select.style.width = '100%';
        select.style.boxSizing = 'border-box';
        populateBookmarkDestinationSelect(select, preferredFolder, preferredSubFolder);
        const handleDestinationChange = (forceNewFolder = false) => {
            if (forceNewFolder || select.value === '__NEW__') {
                const lastValid = select.dataset.lastValid || '';
                openBookmarkFolderCreatorForSelect(select, lastValid);
                return;
            }
            if (select.value !== '__NEW__') {
                select.dataset.lastValid = select.value;
            }
        };
        select.addEventListener('change', () => handleDestinationChange(false));
        select.addEventListener('input', () => handleDestinationChange(false));
        select.addEventListener('click', () => {
            if (select.dataset.noBookmarkFolders === '1' && select.value === '__NEW__') {
                handleDestinationChange(true);
            }
        });
        return select;
    }

    function showBookmarkFolderForm() {
        closeDropdown();
        switchTab('bookmarks');
        bookmarkDisplay.style.display = 'none';
        bookmarkFormWrapper.style.display = 'flex';
        bookmarkFormWrapper.innerHTML = '';

        const form = document.createElement('div');
        Object.assign(form.style, { display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px' });
        const header = document.createElement('div');
        header.className = 'bm-header';
        header.textContent = 'New Bookmark Folder';

        const folderInput = document.createElement('input');
        folderInput.className = 'bm-input';
        folderInput.placeholder = 'Folder name';

        const hint = document.createElement('div');
        hint.className = 'bm-text';
        hint.style.fontSize = '10px';
        hint.style.color = '#777';
        hint.textContent = 'Sub-folders are created manually inside the folder.';

        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', gap: '8px', justifyContent: 'center' });
        const createBtn = document.createElement('button');
        createBtn.className = 'bm-button';
        createBtn.textContent = 'Create';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-button';
        cancelBtn.textContent = 'Cancel';
        row.append(createBtn, cancelBtn);

        createBtn.addEventListener('click', () => {
            const ok = saveBookmarkFolder(folderInput.value);
            if (!ok) return;
            bookmarkActiveFolder = null;
            bookmarkActiveSubFolder = null;
            bookmarkFormWrapper.style.display = 'none';
            bookmarkDisplay.style.display = 'flex';
            renderBookmarks();
        });
        cancelBtn.addEventListener('click', () => {
            bookmarkFormWrapper.style.display = 'none';
            bookmarkDisplay.style.display = 'flex';
            renderBookmarks();
        });
        form.append(header, folderInput, hint, row);
        bookmarkFormWrapper.appendChild(form);
        folderInput.focus();
    }

    function showBookmarkForm(bookmarkToEdit = null) {
        closeDropdown();
        switchTab('bookmarks');
        ensureBookmarkDefaults();
        bookmarkDisplay.style.display = 'none';
        bookmarkFormWrapper.style.display = 'flex';
        bookmarkFormWrapper.innerHTML = '';

        const form = document.createElement('div');
        Object.assign(form.style, { display: 'flex', flexDirection: 'column', gap: '6px', padding: '4px' });
        const header = document.createElement('div');
        header.className = 'bm-header';
        header.textContent = bookmarkToEdit ? 'Edit Bookmark' : 'New Bookmark';

        const topRow = document.createElement('div');
        Object.assign(topRow.style, { display: 'flex', gap: '6px', width: '100%' });
        const nameInput = document.createElement('input');
        nameInput.className = 'bm-input';
        nameInput.placeholder = 'Name';
        nameInput.value = bookmarkToEdit?.name || '';
        nameInput.dataset.autoNameFromUrl = bookmarkToEdit?.name ? '0' : '1';
        Object.assign(nameInput.style, { flex: '1 1 0', minWidth: '0', boxSizing: 'border-box' });
        const urlInput = document.createElement('input');
        urlInput.className = 'bm-input';
        urlInput.placeholder = 'URL / Link';
        urlInput.value = bookmarkToEdit?.url || '';
        Object.assign(urlInput.style, { flex: '1 1 0', minWidth: '0', boxSizing: 'border-box' });
        topRow.append(nameInput, urlInput);

        const destSelect = createBookmarkDestinationSelect(
            bookmarkToEdit?.folder || bookmarkActiveFolder || '',
            bookmarkToEdit?.subfolder || bookmarkActiveSubFolder || ''
        );

        function autoFillNameFromUrl() {
            if (nameInput.dataset.autoNameFromUrl !== '1') return;
            const domain = getBookmarkDomain(urlInput.value);
            if (domain) nameInput.value = domain;
        }
        nameInput.addEventListener('input', () => {
            nameInput.dataset.autoNameFromUrl = nameInput.value.trim() ? '0' : '1';
        });
        urlInput.addEventListener('input', autoFillNameFromUrl);
        urlInput.addEventListener('paste', () => setTimeout(autoFillNameFromUrl, 0));

        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', gap: '8px', justifyContent: 'center' });
        const saveBtn = document.createElement('button');
        saveBtn.className = 'bm-button';
        saveBtn.textContent = bookmarkToEdit ? 'Update' : 'Create';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-button';
        cancelBtn.textContent = 'Cancel';
        row.append(saveBtn, cancelBtn);

        saveBtn.addEventListener('click', () => {
            autoFillNameFromUrl();
            const destination = parseBookmarkDestination(destSelect.value || destSelect.dataset.lastValid || '');
            if (!destination.folder) {
                showFlash('Choose ➕ New folder... from the folder dropdown first', true, 'error');
                return;
            }
            const ok = addOrUpdateBookmark({
                ...(bookmarkToEdit || {}),
                name: nameInput.value,
                url: urlInput.value,
                folder: destination.folder,
                subfolder: destination.subfolder,
                pinned: !!bookmarkToEdit?.pinned
            });
            if (!ok) return;
            bookmarkActiveFolder = destination.folder;
            bookmarkActiveSubFolder = destination.subfolder;
            bookmarkFormWrapper.style.display = 'none';
            bookmarkDisplay.style.display = 'flex';
            renderBookmarks();
            showFlash(bookmarkToEdit ? 'Bookmark updated' : 'Bookmark created', false, 'success');
        });
        cancelBtn.addEventListener('click', () => {
            bookmarkFormWrapper.style.display = 'none';
            bookmarkDisplay.style.display = 'flex';
            renderBookmarks();
        });

        form.append(header, topRow, destSelect, row);
        bookmarkFormWrapper.appendChild(form);
        urlInput.focus();
    }

    function showBookmarkMoveModal(type, name, parentName = null, bookmark = null) {
        const modal = document.createElement('div');
        modal.className = 'bm-modal';
        modal.dataset.noAutoclose = '1';
        Object.assign(modal.style, { padding: '12px', minWidth: '260px', zIndex: '10002' });
        const header = document.createElement('div');
        header.className = 'bm-header';
        header.textContent = `Move ${type}`;
        const select = document.createElement('select');
        select.className = 'bm-input';
        select.style.width = '100%';
        if (type === 'subfolder') {
            const rootOpt = document.createElement('option');
            rootOpt.value = '';
            rootOpt.textContent = '🏠 Root';
            select.appendChild(rootOpt);
        }
        getBookmarkFolders().forEach(folder => {
            if (type === 'folder' && folder.name === name) return;
            if (type === 'subfolder' && folder.name === parentName) return;
            const opt = document.createElement('option');
            opt.value = folder.name;
            opt.textContent = `📁 ${folder.name}`;
            select.appendChild(opt);
        });
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '10px' });
        const moveBtn = document.createElement('button');
        moveBtn.className = 'bm-button';
        moveBtn.textContent = 'Move';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-button';
        cancelBtn.textContent = 'Cancel';
        row.append(moveBtn, cancelBtn);
        moveBtn.addEventListener('click', () => {
            if (type === 'folder') moveBookmarkFolderTo(name, select.value);
            else if (type === 'subfolder') moveBookmarkSubFolderTo(parentName, name, select.value);
            else if (type === 'bookmark' && bookmark) {
                const dest = parseBookmarkDestination(select.value || select.dataset.lastValid || '');
                if (!dest.folder) {
                    showFlash('Create/select a bookmark folder first', true, 'error');
                    return;
                }
                updateBookmark(bookmark.id, { folder: dest.folder, subfolder: dest.subfolder });
                bookmarkActiveFolder = dest.folder;
                bookmarkActiveSubFolder = dest.subfolder;
                showFlash('Bookmark moved', false, 'success');
            }
            modal.remove();
        });
        cancelBtn.addEventListener('click', () => modal.remove());
        if (type === 'bookmark') {
            select.innerHTML = '';
            populateBookmarkDestinationSelect(select, bookmark?.folder, bookmark?.subfolder);
            select.addEventListener('change', () => {
                if (select.value !== '__NEW__') {
                    select.dataset.lastValid = select.value;
                    return;
                }
                const lastValid = select.dataset.lastValid || '';
                select.value = lastValid;
                select.disabled = true;
                showNewFolderModal((folderName) => {
                    select.disabled = false;
                    if (!folderName) {
                        const previous = parseBookmarkDestination(lastValid);
                        populateBookmarkDestinationSelect(select, previous.folder, previous.subfolder);
                        return;
                    }
                    const ok = saveBookmarkFolder(folderName);
                    populateBookmarkDestinationSelect(select, ok ? folderName : parseBookmarkDestination(lastValid).folder, '');
                });
            });
        }
        modal.append(header, select, row);
        panel.appendChild(modal);
        wireModalIdleTracking(modal);
    }

    function showBookmarkBatchMoveModal(ids, onDone) {
        const moveIds = (ids || []).map(id => String(id)).filter(Boolean);
        if (!moveIds.length) {
            showFlash('Nothing to move', true, 'error');
            return;
        }
        const modal = document.createElement('div');
        modal.className = 'bm-modal';
        modal.dataset.noAutoclose = '1';
        Object.assign(modal.style, { padding: '12px', minWidth: '260px', zIndex: '10002' });
        const header = document.createElement('div');
        header.className = 'bm-header';
        header.textContent = `Move ${moveIds.length} bookmark(s)`;

        const select = createBookmarkDestinationSelect(bookmarkActiveFolder || '', bookmarkActiveSubFolder || '');

        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '10px' });
        const moveBtn = document.createElement('button');
        moveBtn.className = 'bm-button';
        moveBtn.textContent = 'Move';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-button';
        cancelBtn.textContent = 'Cancel';
        row.append(moveBtn, cancelBtn);

        moveBtn.addEventListener('click', () => {
            const dest = parseBookmarkDestination(select.value || select.dataset.lastValid || '');
            if (!dest.folder) {
                showFlash('Create/select a bookmark folder first', true, 'error');
                return;
            }
            const changed = updateBookmarksByIds(moveIds, { folder: dest.folder, subfolder: dest.subfolder });
            selectedBookmarkIds.clear();
            bookmarkActiveFolder = dest.folder;
            bookmarkActiveSubFolder = dest.subfolder;
            renderBookmarks();
            modal.remove();
            if (typeof onDone === 'function') onDone(changed, dest);
            else showFlash(`Moved ${changed} bookmark(s)`, false, 'success');
        });
        cancelBtn.addEventListener('click', () => modal.remove());

        modal.append(header, select, row);
        panel.appendChild(modal);
        wireModalIdleTracking(modal);
    }

    function createBookmarkFolderIcon(hasContent, blue = false) {
        const fill1 = blue ? '#5b8def' : '#F6C358';
        const fill2 = blue ? '#7ba7f5' : '#FCD462';
        const paper = hasContent ? '<rect x="55.383" y="133.12" style="fill:#FFFFFF;" width="385.536" height="122.092"/>' : '';
        const icon = document.createElement('div');
        icon.className = 'bm-folder-icon';
        icon.innerHTML = `<svg width="36" height="36" viewBox="0 0 491.52 491.52"><g><path style="fill:${fill1};" d="M445.522,88.989h-259.23c-5.832,0-11.24-3.318-14.26-8.749l-13.88-24.957c-3.021-5.432-8.427-8.749-14.259-8.749H45.998c-9.208,0-16.671,8.126-16.671,18.15v362.151c0,10.024,7.463,18.15,16.671,18.15h399.523c9.207,0,16.671-8.126,16.671-18.15V107.14C462.192,97.116,454.728,88.989,445.522,88.989z"/>${paper}<path style="fill:${fill2};" d="M474.806,216.429H16.714c-10.557,0-17.956,8.348-16.541,18.538l27.158,195.639c1.107,7.974,9.46,14.379,18.667,14.379h399.523c9.207,0,17.56-6.405,18.667-14.379l27.158-195.639C492.761,224.777,485.362,216.429,474.806,216.429z"/></g></svg>`;
        return icon;
    }

    function createFeatureWelcomeState(options = {}) {
        const {
            title = '',
            description = '',
            examples = [],
            buttonText = '',
            onButtonClick = null,
            features = []
        } = options;

        const wrap = document.createElement('div');
        wrap.className = 'bm-feature-welcome';
        Object.assign(wrap.style, {
            width: '100%',
            boxSizing: 'border-box',
            padding: '12px 10px',
            margin: '6px 0 10px',
            border: '1px solid #e4e7ee',
            borderRadius: '12px',
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
            color: '#333',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '7px'
        });

        const heading = document.createElement('div');
        heading.textContent = title;
        Object.assign(heading.style, {
            fontSize: '15px',
            fontWeight: '700',
            color: '#222'
        });

        const desc = document.createElement('div');
        desc.textContent = description;
        Object.assign(desc.style, {
            fontSize: '12px',
            color: '#555',
            lineHeight: '1.35'
        });

        const exampleBox = document.createElement('div');
        Object.assign(exampleBox.style, {
            fontSize: '11.5px',
            lineHeight: '1.45',
            color: '#444',
            textAlign: 'left',
            minWidth: '150px'
        });
        const exampleTitle = document.createElement('div');
        exampleTitle.textContent = 'Examples:';
        exampleTitle.style.fontWeight = '600';
        exampleBox.appendChild(exampleTitle);
        examples.forEach(example => {
            const row = document.createElement('div');
            row.textContent = `• ${example}`;
            exampleBox.appendChild(row);
        });

        wrap.append(heading, desc, exampleBox);

        if (buttonText && typeof onButtonClick === 'function') {
            const action = document.createElement('button');
            action.className = 'bm-button';
            action.textContent = buttonText;
            action.style.fontSize = '12px';
            action.style.fontWeight = '600';
            action.style.padding = '5px 10px';
            action.addEventListener('click', onButtonClick);
            wrap.appendChild(action);
        }

        const separator = document.createElement('div');
        separator.textContent = '────────────';
        Object.assign(separator.style, {
            fontSize: '10px',
            color: '#ccd3df',
            lineHeight: '1'
        });

        const featureLine = document.createElement('div');
        featureLine.textContent = features.map(feature => `✓ ${feature}`).join('   ');
        Object.assign(featureLine.style, {
            fontSize: '10.5px',
            color: '#4c6f52',
            lineHeight: '1.4',
            maxWidth: '100%'
        });
        wrap.append(separator, featureLine);
        return wrap;
    }

    function renderBookmarks() {
        ensureBookmarkDefaults();
        bookmarkFormWrapper.style.display = 'none';
        bookmarkDisplay.style.display = 'flex';
        bookmarkDisplay.innerHTML = '';
        let folderMenu = null;
        const bookmarks = getBookmarks();
        const query = bookmarkSearchQuery.trim().toLowerCase();

        const importToolbar = document.createElement('div');
        Object.assign(importToolbar.style, {
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '6px',
            width: '100%',
            marginBottom: '6px'
        });
        const importBtn = document.createElement('button');
        importBtn.className = 'bm-button';
        importBtn.textContent = '⬇️ Import Bookmarks';
        importBtn.title = 'Import browser-exported bookmarks HTML or Firefox JSON';
        importBtn.addEventListener('click', showBookmarkImportFilePicker);
        importToolbar.appendChild(importBtn);
        bookmarkDisplay.appendChild(importToolbar);

        if (bookmarkActiveFolder || query) {
            const inSub = !!bookmarkActiveSubFolder;
            if (bookmarkActiveFolder) {
                const headerRow = document.createElement('div');
                Object.assign(headerRow.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', width: '100%', marginBottom: '8px' });
                const backBtn = document.createElement('button');
                backBtn.className = 'bm-button';
                backBtn.textContent = '⬅Back';
                backBtn.addEventListener('click', () => {
                    if (bookmarkActiveSubFolder) bookmarkActiveSubFolder = null;
                    else bookmarkActiveFolder = null;
                    renderBookmarks();
                });
                const titleDiv = document.createElement('div');
                titleDiv.className = 'bm-header';
                titleDiv.style.margin = '0';
                titleDiv.style.flex = '1';
                titleDiv.textContent = inSub ? `${bookmarkActiveFolder} / ${bookmarkActiveSubFolder}` : bookmarkActiveFolder;
                headerRow.append(backBtn, titleDiv);
                const addSubBtn = document.createElement('button');
                addSubBtn.className = 'bm-button';
                addSubBtn.textContent = '＋ Sub-folder';
                if (inSub) {
                    addSubBtn.style.opacity = '0.5';
                    addSubBtn.style.cursor = 'not-allowed';
                    addSubBtn.title = 'Maximum folder depth reached (2 levels)';
                    addSubBtn.addEventListener('click', () => {
                        showFlash('Maximum folder depth reached (2 levels)', true, 'warning');
                    });
                } else {
                    addSubBtn.addEventListener('click', () => showNewFolderModal((name) => {
                        if (name) { saveBookmarkSubFolder(bookmarkActiveFolder, name); renderBookmarks(); }
                    }));
                }
                headerRow.appendChild(addSubBtn);
                bookmarkDisplay.appendChild(headerRow);

                if (!inSub) {
                    const subSection = document.createElement('div');
                    Object.assign(subSection.style, {
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '10px',
                        width: '100%',
                        marginBottom: '8px'
                    });
                    const subs = getBookmarkSubFolders(bookmarkActiveFolder).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.name.localeCompare(b.name));
                    subs.forEach(sf => {
                        const count = bookmarks.filter(b => b.folder === bookmarkActiveFolder && b.subfolder === sf.name).length;
                        const wrapper = document.createElement('div');
                        wrapper.className = 'bm-folder-icon-wrapper';
                        wrapper.appendChild(createBookmarkFolderIcon(count > 0, true));
                        const label = document.createElement('div');
                        label.className = 'bm-folder-label';
                        label.textContent = sf.pinned ? `📌 ${sf.name}` : sf.name;
                        wrapper.appendChild(label);
                        wrapper.addEventListener('dblclick', () => {
                            bookmarkActiveSubFolder = sf.name;
                            renderBookmarks();
                        });
                        const menuIcon = document.createElement('div');
                        menuIcon.textContent = '⋮';
                        menuIcon.className = 'bm-folder-menu-icon';
                        menuIcon.style.position = 'absolute';
                        menuIcon.style.top = '2px';
                        menuIcon.style.right = '2px';
                        menuIcon.addEventListener('click', e => {
                            e.stopPropagation();
                            closeAllContextMenus();
                            const menu = buildContextMenu('bm-folder-menu-open');
                            const closeMenu = openContextMenuAtEvent(menu, e, menuIcon, () => { folderMenu = null; });
                            folderMenu = menu;
                            const renameBtn = document.createElement('button');
                            renameBtn.className = 'bm-button';
                            renameBtn.textContent = '✏️ Rename';
                            renameBtn.onclick = () => { closeMenu(); showRenameModal(sf.name, n => { if (n) renameBookmarkSubFolder(bookmarkActiveFolder, sf.name, n); }); };
                            const moveBtn = document.createElement('button');
                            moveBtn.className = 'bm-button';
                            moveBtn.textContent = '📂 Move';
                            moveBtn.onclick = () => { closeMenu(); showBookmarkMoveModal('subfolder', sf.name, bookmarkActiveFolder); };
                            const delBtn = document.createElement('button');
                            delBtn.className = 'bm-button';
                            delBtn.textContent = '🗑️ Delete';
                            delBtn.onclick = () => { closeMenu(); bmConfirm(`Delete sub-folder "${sf.name}" and all bookmarks?`, ok => { if (ok) deleteBookmarkSubFolder(bookmarkActiveFolder, sf.name); }); };
                            const pinBtn = document.createElement('button');
                            pinBtn.className = 'bm-button';
                            pinBtn.textContent = sf.pinned ? '📌 Unpin' : '📍 Pin';
                            pinBtn.onclick = () => { closeMenu(); updateBookmarkSubFolder(bookmarkActiveFolder, sf.name, { pinned: !sf.pinned }); };
                            menu.append(renameBtn, moveBtn, delBtn, pinBtn);
                        });
                        wrapper.appendChild(menuIcon);
                        subSection.appendChild(wrapper);
                    });
                    bookmarkDisplay.appendChild(subSection);
                }
            }

            const list = bookmarks.filter(b => {
                if (bookmarkActiveFolder) {
                    return b.folder === bookmarkActiveFolder && (inSub ? b.subfolder === bookmarkActiveSubFolder : !b.subfolder);
                }
                return true;
            })
                .filter(b => !query || [b.name, b.url, b.domain].some(v => String(v || '').toLowerCase().includes(query)))
                .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(a.name || '').localeCompare(String(b.name || '')));

            const selectedVisibleCount = list.filter(bookmark => selectedBookmarkIds.has(String(bookmark.id))).length;
            if (selectedVisibleCount > 0) {
                const batchBar = document.createElement('div');
                batchBar.className = 'bm-batch-bar';

                const selectAllBtn = document.createElement('button');
                selectAllBtn.className = 'bm-batch-btn';
                selectAllBtn.textContent = selectedVisibleCount === list.length ? 'Unselect All' : 'Select All';
                selectAllBtn.addEventListener('click', () => {
                    if (selectedVisibleCount === list.length) {
                        list.forEach(bookmark => selectedBookmarkIds.delete(String(bookmark.id)));
                    } else {
                        list.forEach(bookmark => selectedBookmarkIds.add(String(bookmark.id)));
                    }
                    renderBookmarks();
                });

                const copyBtn = document.createElement('button');
                copyBtn.className = 'bm-batch-btn';
                copyBtn.textContent = '📋';
                copyBtn.title = `Copy URLs (${selectedVisibleCount})`;
                copyBtn.addEventListener('click', () => {
                    const selectedUrls = list
                        .filter(bookmark => selectedBookmarkIds.has(String(bookmark.id)))
                        .map(bookmark => bookmark.url)
                        .filter(url => String(url || '').trim());
                    if (!selectedUrls.length) {
                        showFlash('Nothing to copy', true, 'error');
                        return;
                    }
                    copyToClipboard(selectedUrls.join('\n'));
                });

                const moveBtn = document.createElement('button');
                moveBtn.className = 'bm-batch-btn';
                moveBtn.textContent = '📂';
                moveBtn.title = `Move (${selectedVisibleCount})`;
                moveBtn.addEventListener('click', () => {
                    const ids = list.filter(bookmark => selectedBookmarkIds.has(String(bookmark.id))).map(bookmark => bookmark.id);
                    showBookmarkBatchMoveModal(ids, (changed) => showFlash(`Moved ${changed} bookmark(s)`, false, 'success'));
                });

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'bm-batch-btn';
                deleteBtn.textContent = '🗑️';
                deleteBtn.title = `Delete (${selectedVisibleCount})`;
                deleteBtn.addEventListener('click', () => {
                    bmConfirm(`Delete ${selectedVisibleCount} selected bookmark(s)?`, (ok) => {
                        if (!ok) return;
                        const ids = list.filter(bookmark => selectedBookmarkIds.has(String(bookmark.id))).map(bookmark => bookmark.id);
                        const deleted = deleteBookmarksByIds(ids);
                        showFlash(`Deleted ${deleted} bookmark(s)`, false, 'success');
                    });
                });

                const pinBtn = document.createElement('button');
                pinBtn.className = 'bm-batch-btn';
                pinBtn.textContent = '📌';
                pinBtn.title = `Pin (${selectedVisibleCount})`;
                pinBtn.addEventListener('click', () => {
                    const ids = list.filter(bookmark => selectedBookmarkIds.has(String(bookmark.id))).map(bookmark => bookmark.id);
                    const changed = updateBookmarksByIds(ids, { pinned: true });
                    showFlash(`Pinned ${changed} bookmark(s)`, false, 'success');
                });

                const unpinBtn = document.createElement('button');
                unpinBtn.className = 'bm-batch-btn';
                unpinBtn.textContent = '📍';
                unpinBtn.title = `Unpin (${selectedVisibleCount})`;
                unpinBtn.addEventListener('click', () => {
                    const ids = list.filter(bookmark => selectedBookmarkIds.has(String(bookmark.id))).map(bookmark => bookmark.id);
                    const changed = updateBookmarksByIds(ids, { pinned: false });
                    showFlash(`Unpinned ${changed} bookmark(s)`, false, 'success');
                });

                batchBar.append(selectAllBtn, copyBtn, moveBtn, deleteBtn, pinBtn, unpinBtn);
                bookmarkDisplay.appendChild(batchBar);
            }

            const listWrap = document.createElement('div');
            Object.assign(listWrap.style, {
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: '0',
                width: '100%',
                alignContent: 'flex-start',
                justifyContent: 'flex-start'
            });
            list.forEach(bookmark => listWrap.appendChild(createBookmarkItem(bookmark)));
            bookmarkDisplay.appendChild(listWrap);
            if (!list.length && (!bookmarkActiveFolder || inSub || getBookmarkSubFolders(bookmarkActiveFolder).length === 0)) {
                const empty = document.createElement('div');
                empty.className = 'bm-text';
                empty.style.margin = '12px auto';
                empty.style.color = '#888';
                empty.textContent = query ? 'No bookmarks found' : 'No bookmarks here';
                bookmarkDisplay.appendChild(empty);
            }
            return;
        }

        const folders = getBookmarkFolders().map(folder => ({ ...folder, count: bookmarks.filter(b => b.folder === folder.name).length }));
        folders.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.name.localeCompare(b.name));
        if (folders.length === 0) {
            bookmarkDisplay.appendChild(createFeatureWelcomeState({
                title: '🔖 Welcome to Bookmarks',
                description: 'Save the pages you use every day.',
                examples: ['FC Research', 'Rodeo', 'Atlas', 'Slack', 'Wiki'],
                buttonText: '+ Add First Bookmark',
                onButtonClick: () => showBookmarkForm(),
                features: ['Organize into folders', 'Search instantly', 'Favorite important pages', 'Import / Export']
            }));
            return;
        }
        folders.forEach(folder => {
            const subCount = getBookmarkSubFolders(folder.name).length;
            const wrapper = document.createElement('div');
            wrapper.className = 'bm-folder-icon-wrapper';
            wrapper.appendChild(createBookmarkFolderIcon(folder.count > 0 || subCount > 0));
            const label = document.createElement('div');
            label.className = 'bm-folder-label';
            label.textContent = folder.pinned ? `📌 ${folder.name}` : folder.name;
            wrapper.appendChild(label);
            wrapper.addEventListener('dblclick', () => {
                bookmarkActiveFolder = folder.name;
                bookmarkActiveSubFolder = null;
                renderBookmarks();
            });
            const menuIcon = document.createElement('div');
            menuIcon.textContent = '⋮';
            menuIcon.className = 'bm-folder-menu-icon';
            menuIcon.style.position = 'absolute';
            menuIcon.style.top = '2px';
            menuIcon.style.right = '2px';
            menuIcon.addEventListener('click', e => {
                e.stopPropagation();
                closeAllContextMenus();
                const menu = buildContextMenu('bm-folder-menu-open');
                const closeMenu = openContextMenuAtEvent(menu, e, menuIcon, () => { folderMenu = null; });
                folderMenu = menu;
                const renameBtn = document.createElement('button');
                renameBtn.className = 'bm-button';
                renameBtn.textContent = '✏️ Rename';
                renameBtn.onclick = () => { closeMenu(); showRenameModal(folder.name, n => { if (n) renameBookmarkFolder(folder.name, n); }); };
                const moveBtn = document.createElement('button');
                moveBtn.className = 'bm-button';
                moveBtn.textContent = '📂 Move';
                moveBtn.onclick = () => { closeMenu(); showBookmarkMoveModal('folder', folder.name); };
                const delBtn = document.createElement('button');
                delBtn.className = 'bm-button';
                delBtn.textContent = '🗑️ Delete';
                delBtn.onclick = () => { closeMenu(); bmConfirm(`Delete bookmark folder "${folder.name}"?`, ok => { if (ok) deleteBookmarkFolder(folder.name); }); };
                const pinBtn = document.createElement('button');
                pinBtn.className = 'bm-button';
                pinBtn.textContent = folder.pinned ? '📌 Unpin' : '📍 Pin';
                pinBtn.onclick = () => { closeMenu(); updateBookmarkFolder(folder.name, { pinned: !folder.pinned }); };
                menu.append(renameBtn, moveBtn, delBtn, pinBtn);
            });
            wrapper.appendChild(menuIcon);
            bookmarkDisplay.appendChild(wrapper);
        });
    }

    function createBookmarkItem(bookmark) {
        const row = document.createElement('div');
        Object.assign(row.style, {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            width: '130px',
            minHeight: '130px',
            margin: '4px',
            padding: '6px 4px',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            background: '#fff',
            boxSizing: 'border-box',
            position: 'relative'
        });
        const icon = document.createElement('img');
        icon.src = bookmark.favicon || getBookmarkFaviconUrl(bookmark.url);
        icon.width = 24;
        icon.height = 24;
        icon.style.borderRadius = '4px';
        icon.onerror = () => {
            const fallback = getBookmarkFallbackFaviconUrl(bookmark.url);
            if (fallback && icon.src !== fallback) icon.src = fallback;
            else icon.replaceWith(document.createTextNode('🔗'));
        };
        const text = document.createElement('div');
        Object.assign(text.style, { display: 'flex', flexDirection: 'column', minWidth: '0', width: '100%', textAlign: 'center' });
        const link = document.createElement('a');
        link.href = bookmark.url;
        link.target = '_blank';
        link.textContent = bookmark.pinned ? `📌 ${bookmark.name}` : bookmark.name;
        link.style.fontWeight = 'bold';
        link.style.color = '#1976d2';
        link.style.textDecoration = 'none';
        link.style.fontSize = '11px';
        link.style.overflow = 'hidden';
        link.style.textOverflow = 'ellipsis';
        link.style.whiteSpace = 'nowrap';
        const sub = document.createElement('span');
        sub.className = 'bm-text';
        sub.textContent = bookmark.domain || bookmark.url;
        sub.style.fontSize = '10px';
        sub.style.color = '#777';
        sub.style.overflow = 'hidden';
        sub.style.textOverflow = 'ellipsis';
        sub.style.whiteSpace = 'nowrap';
        text.append(link, sub);
        const menuIcon = document.createElement('div');
        menuIcon.textContent = '⋮';
        Object.assign(menuIcon.style, { cursor: 'pointer', fontSize: '18px', padding: '0 4px', position: 'absolute', top: '2px', right: '2px' });

        const batchCheckbox = document.createElement('input');
        batchCheckbox.type = 'checkbox';
        batchCheckbox.className = 'bm-batch-checkbox';
        batchCheckbox.title = 'Select for batch actions';
        batchCheckbox.checked = selectedBookmarkIds.has(String(bookmark.id));
        Object.assign(batchCheckbox.style, { position: 'absolute', top: '4px', left: '4px' });
        batchCheckbox.addEventListener('click', e => {
            e.stopPropagation();
            if (batchCheckbox.checked) {
                selectedBookmarkIds.add(String(bookmark.id));
            } else {
                selectedBookmarkIds.delete(String(bookmark.id));
            }
            renderBookmarks();
        });

        let menu = null;
        menuIcon.addEventListener('click', e => {
            e.stopPropagation(); closeAllContextMenus();
            menu = buildContextMenu('bm-barcode-menu-open');
            const closeMenu = openContextMenuAtEvent(menu, e, menuIcon, () => { menu = null; });
            const openBtn = document.createElement('button'); openBtn.className = 'bm-button'; openBtn.textContent = '↗️ Open'; openBtn.onclick = () => { closeMenu(); window.open(bookmark.url, '_blank'); };
            const copyBtn = document.createElement('button'); copyBtn.className = 'bm-button'; copyBtn.textContent = '📋 Copy'; copyBtn.onclick = () => { closeMenu(); copyToClipboard(bookmark.url); };
            const editBtn = document.createElement('button'); editBtn.className = 'bm-button'; editBtn.textContent = '✏️ Edit'; editBtn.onclick = () => { closeMenu(); showBookmarkForm(bookmark); };
            const moveBtn = document.createElement('button'); moveBtn.className = 'bm-button'; moveBtn.textContent = '📂 Move'; moveBtn.onclick = () => { closeMenu(); showBookmarkMoveModal('bookmark', bookmark.name, null, bookmark); };
            const delBtn = document.createElement('button'); delBtn.className = 'bm-button'; delBtn.textContent = '🗑️ Delete'; delBtn.onclick = () => { closeMenu(); bmConfirm(`Delete bookmark "${bookmark.name}"?`, ok => { if (ok) deleteBookmark(bookmark.id); }); };
            const pinBtn = document.createElement('button'); pinBtn.className = 'bm-button'; pinBtn.textContent = bookmark.pinned ? '📌 Unpin' : '📍 Pin'; pinBtn.onclick = () => { closeMenu(); updateBookmark(bookmark.id, { pinned: !bookmark.pinned }); };
            menu.append(openBtn, copyBtn, editBtn, moveBtn, delBtn, pinBtn);
        });
        row.append(batchCheckbox, icon, text, menuIcon);
        return row;
    }

    ensureBookmarkDefaults();
    renderBookmarks();

    // --- Notebook Tab Implementation ---
    const notesTabContent = document.createElement('div');
    Object.assign(notesTabContent.style, {
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 auto',
        minHeight: '0',
        width: '100%'
    });

    const noteFormWrapper = document.createElement('div');
    Object.assign(noteFormWrapper.style, {
        flex: '0 0 auto',
        overflow: 'visible',
        minHeight: '0',
        display: 'none',
        flexDirection: 'column',
        justifyContent: 'flex-start'
    });
    notesTabContent.appendChild(noteFormWrapper);

    const noteDisplay = document.createElement('div');
    Object.assign(noteDisplay.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        overflow: 'auto',
        flex: '1 1 auto',
        minHeight: '0',
        maxHeight: '100%',
        alignContent: 'flex-start',
        justifyContent: 'flex-start',
        padding: '2px',
        boxSizing: 'border-box'
    });
    notesTabContent.appendChild(noteDisplay);

    registerTab('notes', '📓 Notebook', notesTabContent);

    let activeNoteId = null;
    let activeNoteFolder = null;
    let selectedNoteIds = new Set();
    let noteSearchQuery = '';
    let noteSortMode = 'updated-desc';
    let showArchivedNotes = false;

    function populateNoteFolderSelect(select, preferredFolder = '') {
        const folders = NoteService.getNoteFolders().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.name.localeCompare(b.name));
        select.innerHTML = '';
        folders.forEach(folder => {
            const opt = document.createElement('option');
            opt.value = folder.name;
            opt.textContent = `📁 ${folder.name}`;
            select.appendChild(opt);
        });
        const addOpt = document.createElement('option');
        addOpt.value = '__NEW__';
        addOpt.textContent = '➕ New notebook folder...';
        select.appendChild(addOpt);
        select.disabled = false;
        select.dataset.noFolders = folders.length ? '0' : '1';
        const preferred = String(preferredFolder || '').trim();
        const exists = folders.some(folder => folder.name === preferred);
        select.value = exists ? preferred : (folders[0]?.name || '__NEW__');
        select.dataset.lastValid = select.value === '__NEW__' ? '' : select.value;
    }

    function createNoteFolderSelect(preferredFolder = '') {
        const select = document.createElement('select');
        select.className = 'bm-input';
        select.style.width = '100%';
        select.style.boxSizing = 'border-box';
        populateNoteFolderSelect(select, preferredFolder);
        let folderModalOpen = false;
        const handleChange = () => {
            if (select.value !== '__NEW__') {
                select.dataset.lastValid = select.value;
                return;
            }
            if (folderModalOpen) return;
            folderModalOpen = true;
            const lastValid = select.dataset.lastValid || '';
            select.value = lastValid || '__NEW__';
            select.disabled = true;
            showNewFolderModal((name) => {
                folderModalOpen = false;
                select.disabled = false;
                if (!name) {
                    populateNoteFolderSelect(select, lastValid);
                    return;
                }
                const ok = NoteService.createNoteFolder(name);
                populateNoteFolderSelect(select, ok ? name : lastValid);
            });
        };
        select.addEventListener('change', handleChange);
        select.addEventListener('input', handleChange);
        select.addEventListener('click', () => {
            if (select.dataset.noFolders === '1' && select.value === '__NEW__') handleChange();
        });
        return select;
    }

    // Sanitize stored note HTML before it is rendered (guards imported backups).
    // Uses DOMParser so the parsed document is inert (no script execution, no image loading).
    function sanitizeNoteHtml(html) {
        const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
        doc.querySelectorAll('script, style, iframe, object, embed, link, meta, base, form').forEach(el => el.remove());
        doc.querySelectorAll('*').forEach(el => {
            [...el.attributes].forEach(attr => {
                const name = attr.name.toLowerCase();
                const val = String(attr.value || '');
                if (name.startsWith('on')) {
                    el.removeAttribute(attr.name);
                } else if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(val)) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        return doc.body.innerHTML;
    }

    function getNoteSummary(note) {
        let raw = String(note?.content || '');
        if (note?.format === 'html') {
            const doc = new DOMParser().parseFromString(raw, 'text/html');
            doc.querySelectorAll('img').forEach(img => img.replaceWith('🖼️ '));
            raw = doc.body.textContent || '';
        }
        const content = raw.replace(/\s+/g, ' ').trim();
        return content ? content.slice(0, 120) : 'No content yet.';
    }

    function formatNoteDate(value) {
        const ts = Number(value || 0);
        if (!ts) return '';
        try {
            return new Date(ts).toLocaleString();
        } catch {
            return '';
        }
    }

    async function showNoteEditor(noteToEdit = null) {
        closeDropdown();
        switchTab('notes');
        activeNoteId = noteToEdit?.id || null;
        noteDisplay.style.display = 'none';
        noteFormWrapper.style.display = 'flex';
        noteFormWrapper.innerHTML = '';

        const form = document.createElement('div');
        Object.assign(form.style, { display: 'flex', flexDirection: 'column', gap: '6px', padding: '4px' });

        const header = document.createElement('div');
        header.className = 'bm-header';
        header.textContent = noteToEdit ? 'Edit Note' : 'New Note';

        const titleInput = document.createElement('input');
        titleInput.className = 'bm-input';
        titleInput.placeholder = 'Title';
        titleInput.value = noteToEdit?.title || '';

        const folderSelect = createNoteFolderSelect(noteToEdit?.folderId || activeNoteFolder || '');
        folderSelect.style.marginBottom = '0';

        const tagsInput = document.createElement('input');
        tagsInput.className = 'bm-input';
        tagsInput.placeholder = 'Tags (comma separated)';
        tagsInput.value = Array.isArray(noteToEdit?.tags) ? noteToEdit.tags.join(', ') : '';

        // --- Rich text editor with formatting toolbar ---
        const editorWrap = document.createElement('div');
        Object.assign(editorWrap.style, {
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid #cfd8dc',
            borderRadius: '6px',
            overflow: 'hidden',
            background: '#fff'
        });

        const toolbar = document.createElement('div');
        Object.assign(toolbar.style, {
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '2px',
            padding: '4px',
            borderBottom: '1px solid #eceff1',
            background: '#f7f9fb'
        });

        const contentEditor = document.createElement('div');
        contentEditor.className = 'bm-note-editor bm-modal-scroll';
        contentEditor.contentEditable = 'true';
        contentEditor.dataset.placeholder = 'Write your note… (paste a screenshot directly, or use 📎 to attach an image)';
        Object.assign(contentEditor.style, {
            minHeight: '180px',
            maxHeight: '340px',
            overflowY: 'auto',
            padding: '8px 10px',
            fontSize: '13px',
            lineHeight: '1.5',
            outline: 'none',
            color: '#222'
        });

        // Load existing content (upgrade legacy plain-text notes to rich on next save)
        if (noteToEdit) {
            if (noteToEdit.format === 'html') {
                contentEditor.innerHTML = sanitizeNoteHtml(noteToEdit.content || '');
            } else {
                contentEditor.textContent = noteToEdit.content || '';
            }
        }

        // Hidden image picker (images only)
        const imageInput = document.createElement('input');
        imageInput.type = 'file';
        imageInput.accept = 'image/*';
        imageInput.style.display = 'none';

        function exec(cmd, value = null) {
            contentEditor.focus();
            document.execCommand(cmd, false, value);
        }

        function insertImageFile(file) {
            if (!file) return;
            if (!file.type || !file.type.startsWith('image/')) {
                showFlash('Only image files can be attached', true, 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                contentEditor.focus();
                document.execCommand('insertHTML', false,
                    `<img src="${reader.result}" style="max-width:100%;height:auto;border-radius:4px;margin:4px 0;display:block;">`);
            };
            reader.onerror = () => showFlash('Could not read image', true, 'error');
            reader.readAsDataURL(file);
        }

        imageInput.addEventListener('change', () => {
            const file = imageInput.files && imageInput.files[0];
            if (file) insertImageFile(file);
            imageInput.value = '';
        });

        // Paste screenshots directly
        contentEditor.addEventListener('paste', (e) => {
            const items = (e.clipboardData || window.clipboardData)?.items;
            if (!items) return;
            for (const it of items) {
                if (it.type && it.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = it.getAsFile();
                    if (file) insertImageFile(file);
                    return;
                }
            }
        });

        // --- Toolbar controls ---
        function mkToolBtn(label, title, onClick, styleOverrides) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.title = title;
            Object.assign(b.style, {
                minWidth: '26px',
                height: '26px',
                border: '1px solid transparent',
                background: 'transparent',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#37474f',
                padding: '0 5px',
                lineHeight: '1'
            }, styleOverrides || {});
            // Prevent the button from stealing selection focus
            b.addEventListener('mousedown', (e) => e.preventDefault());
            b.addEventListener('click', (e) => { e.preventDefault(); onClick(b); });
            b.addEventListener('mouseenter', () => { b.style.background = '#e3eaf0'; });
            b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; });
            return b;
        }

        function mkSep() {
            const s = document.createElement('span');
            Object.assign(s.style, { width: '1px', height: '18px', background: '#dfe6ea', margin: '0 3px' });
            return s;
        }

        // Text-style dropdown (Aa)
        const styleSelect = document.createElement('select');
        styleSelect.title = 'Text style';
        Object.assign(styleSelect.style, {
            height: '26px', border: '1px solid #dfe6ea', borderRadius: '4px',
            background: '#fff', cursor: 'pointer', fontSize: '12px', color: '#37474f', padding: '0 4px'
        });
        [['P', 'Normal'], ['H2', 'Heading'], ['H3', 'Subheading']].forEach(([val, label]) => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = label;
            styleSelect.appendChild(opt);
        });
        styleSelect.addEventListener('mousedown', (e) => e.stopPropagation());
        styleSelect.addEventListener('change', () => { exec('formatBlock', styleSelect.value); });

        // Emoji picker
        const emojiList = ['😀', '😊', '👍', '🎉', '✅', '❌', '⚠️', '🔥', '⭐', '💡', '📌', '📝', '❤️', '🚀', '🕒', '📎'];
        let emojiPopup = null;
        function closeEmojiPopup() {
            if (emojiPopup) { emojiPopup.remove(); emojiPopup = null; document.removeEventListener('mousedown', onEmojiOutside, true); }
        }
        function onEmojiOutside(e) {
            if (emojiPopup && !emojiPopup.contains(e.target)) closeEmojiPopup();
        }
        function openEmojiPopup(anchor) {
            if (emojiPopup) { closeEmojiPopup(); return; }
            emojiPopup = document.createElement('div');
            Object.assign(emojiPopup.style, {
                position: 'fixed', zIndex: '100000', background: '#fff',
                border: '1px solid #cfd8dc', borderRadius: '6px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.15)', padding: '4px',
                display: 'flex', flexWrap: 'wrap', gap: '2px', maxWidth: '208px'
            });
            emojiList.forEach(em => {
                const opt = document.createElement('button');
                opt.type = 'button';
                opt.textContent = em;
                Object.assign(opt.style, { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', padding: '3px 5px', borderRadius: '4px' });
                opt.addEventListener('mousedown', (e) => e.preventDefault());
                opt.addEventListener('click', () => { exec('insertText', em); closeEmojiPopup(); });
                emojiPopup.appendChild(opt);
            });
            const r = anchor.getBoundingClientRect();
            document.body.appendChild(emojiPopup);
            emojiPopup.style.left = `${Math.round(Math.min(r.left, window.innerWidth - emojiPopup.offsetWidth - 8))}px`;
            emojiPopup.style.top = `${Math.round(r.bottom + 4)}px`;
            setTimeout(() => document.addEventListener('mousedown', onEmojiOutside, true), 0);
        }

        function insertInlineCode() {
            const sel = window.getSelection();
            const selectedText = sel ? String(sel) : '';
            contentEditor.focus();
            if (selectedText) {
                document.execCommand('insertHTML', false, `<code>${selectedText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>&nbsp;`);
            } else {
                document.execCommand('insertHTML', false, '<code>code</code>&nbsp;');
            }
        }

        function insertLink() {
            const url = window.prompt('Link URL:', 'https://');
            if (!url) return;
            const sel = window.getSelection();
            contentEditor.focus();
            if (sel && String(sel).trim()) {
                exec('createLink', url);
            } else {
                const safeUrl = url.replace(/"/g, '%22');
                document.execCommand('insertHTML', false, `<a href="${safeUrl}" target="_blank" rel="noopener">${url}</a>&nbsp;`);
            }
        }

        toolbar.append(
            mkToolBtn('B', 'Bold', () => exec('bold'), { fontWeight: 'bold' }),
            mkToolBtn('I', 'Italic', () => exec('italic'), { fontStyle: 'italic' }),
            mkToolBtn('S', 'Strikethrough', () => exec('strikeThrough'), { textDecoration: 'line-through' }),
            mkToolBtn('</>', 'Inline code', () => insertInlineCode(), { fontFamily: 'monospace', fontSize: '11px' }),
            mkToolBtn('🔗', 'Insert link', () => insertLink()),
            mkSep(),
            mkToolBtn('•', 'Bulleted list', () => exec('insertUnorderedList'), { fontSize: '16px' }),
            mkToolBtn('1.', 'Numbered list', () => exec('insertOrderedList')),
            styleSelect,
            mkSep(),
            mkToolBtn('😊', 'Emoji', (b) => openEmojiPopup(b)),
            mkToolBtn('📎', 'Attach image', () => imageInput.click())
        );

        editorWrap.append(toolbar, contentEditor, imageInput);

        const meta = document.createElement('div');
        meta.className = 'bm-text';
        meta.style.fontSize = '10.5px';
        meta.style.color = '#777';
        meta.textContent = noteToEdit ? `Updated: ${formatNoteDate(noteToEdit.updatedAt)}` : 'Rich text: format text, paste screenshots, attach images.';

        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' });

        const saveBtn = document.createElement('button');
        saveBtn.className = 'bm-button';
        saveBtn.textContent = noteToEdit ? 'Update' : 'Create';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-button';
        cancelBtn.textContent = 'Cancel';
        row.append(saveBtn, cancelBtn);

        async function saveFromEditor() {
            const folderId = String(folderSelect.value || folderSelect.dataset.lastValid || '').trim();
            if (!folderId || folderId === '__NEW__' || folderSelect.dataset.noFolders === '1') {
                showFlash('Create/select a notebook folder first', true, 'error');
                return false;
            }
            const firstLine = (contentEditor.textContent || '').trim().split('\n')[0] || '';
            const payload = {
                title: titleInput.value.trim() || firstLine || 'Untitled Note',
                content: sanitizeNoteHtml(contentEditor.innerHTML),
                format: 'html',
                folderId,
                tags: NoteService.normalizeTags(tagsInput.value)
            };
            let saved;
            if (noteToEdit) {
                saved = await NoteService.updateNote(noteToEdit.id, payload);
            } else {
                saved = await NoteService.createNote(payload);
            }
            if (!saved) return false;
            activeNoteId = saved.id;
            activeNoteFolder = saved.folderId || activeNoteFolder;
            noteFormWrapper.style.display = 'none';
            noteDisplay.style.display = 'flex';
            await renderNotes();
            showFlash(noteToEdit ? 'Note updated' : 'Note created', false, 'success');
            return true;
        }

        saveBtn.addEventListener('click', saveFromEditor);
        cancelBtn.addEventListener('click', () => {
            noteFormWrapper.innerHTML = '';
            noteFormWrapper.style.display = 'none';
            noteDisplay.style.display = 'flex';
            activeNoteId = null;
            renderNotes();
        });

        form.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                cancelBtn.click();
            }
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                saveBtn.click();
            }
        });

        form.append(header, titleInput, folderSelect, tagsInput, editorWrap, meta, row);
        noteFormWrapper.appendChild(form);
        titleInput.focus();
    }

    function showNoteBatchMoveModal(ids, onDone) {
        const moveIds = (ids || []).map(id => String(id)).filter(Boolean);
        if (!moveIds.length) {
            showFlash('Nothing to move', true, 'error');
            return;
        }
        const modal = document.createElement('div');
        modal.className = 'bm-modal';
        modal.dataset.noAutoclose = '1';
        Object.assign(modal.style, { padding: '12px', minWidth: '260px', zIndex: '10002' });
        const header = document.createElement('div');
        header.className = 'bm-header';
        header.textContent = `Move ${moveIds.length} note(s)`;

        const select = createNoteFolderSelect(activeNoteFolder || '');

        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '10px' });
        const moveBtn = document.createElement('button');
        moveBtn.className = 'bm-button';
        moveBtn.textContent = 'Move';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-button';
        cancelBtn.textContent = 'Cancel';
        row.append(moveBtn, cancelBtn);

        moveBtn.addEventListener('click', () => {
            const destFolderId = select.value || select.dataset.lastValid || '';
            if (!destFolderId) {
                showFlash('Create/select a folder first', true, 'error');
                return;
            }
            let changed = 0;
            moveIds.forEach(id => {
                const note = NoteService.getNotes().find(n => String(n.id) === id);
                if (note && note.folderId !== destFolderId) {
                    NoteService.updateNote(id, { folderId: destFolderId });
                    changed++;
                }
            });
            selectedNoteIds.clear();
            activeNoteFolder = destFolderId;
            renderNotes();
            modal.remove();
            if (typeof onDone === 'function') onDone(changed, destFolderId);
            else showFlash(`Moved ${changed} note(s)`, false, 'success');
        });
        cancelBtn.addEventListener('click', () => modal.remove());

        modal.append(header, select, row);
        document.body.appendChild(modal);
    }

    function createNoteCard(note) {
        const card = document.createElement('div');
        Object.assign(card.style, {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            width: '130px',
            minHeight: '130px',
            margin: '4px',
            padding: '12px 6px 6px 6px',
            border: String(note.id) === String(activeNoteId) ? '1px solid #7ba7f5' : '1px solid #e0e0e0',
            borderRadius: '8px',
            background: note.archived ? '#fafafa' : '#fff',
            boxSizing: 'border-box',
            position: 'relative',
            cursor: 'pointer'
        });

        const batchCheckbox = document.createElement('input');
        batchCheckbox.type = 'checkbox';
        batchCheckbox.className = 'bm-batch-checkbox';
        batchCheckbox.title = 'Select for batch actions';
        batchCheckbox.checked = selectedNoteIds.has(String(note.id));
        Object.assign(batchCheckbox.style, { position: 'absolute', top: '4px', left: '4px' });
        batchCheckbox.addEventListener('click', e => {
            e.stopPropagation();
            if (batchCheckbox.checked) {
                selectedNoteIds.add(String(note.id));
            } else {
                selectedNoteIds.delete(String(note.id));
            }
            renderNotes();
        });

        const menuIcon = document.createElement('div');
        menuIcon.textContent = '⋮';
        Object.assign(menuIcon.style, { cursor: 'pointer', fontSize: '18px', padding: '0 4px', position: 'absolute', top: '2px', right: '2px' });

        let menu = null;
        menuIcon.addEventListener('click', e => {
            e.stopPropagation(); closeAllContextMenus();
            menu = buildContextMenu('bm-barcode-menu-open');
            const closeMenu = openContextMenuAtEvent(menu, e, menuIcon, () => { menu = null; });
            const editBtn = document.createElement('button'); editBtn.className = 'bm-button'; editBtn.textContent = '✏️ Edit'; editBtn.onclick = () => { closeMenu(); showNoteEditor(note); };
            const pinBtn = document.createElement('button'); pinBtn.className = 'bm-button'; pinBtn.textContent = note.pinned ? '📌 Unpin' : '📍 Pin'; pinBtn.onclick = async () => { closeMenu(); await NoteService.updateNote(note.id, { pinned: !note.pinned }); renderNotes(); };
            const dupBtn = document.createElement('button'); dupBtn.className = 'bm-button'; dupBtn.textContent = '⧉ Duplicate'; dupBtn.onclick = async () => { closeMenu(); const duplicated = await NoteService.duplicateNote(note.id); activeNoteId = duplicated?.id || null; renderNotes(); if (duplicated) showFlash('Note duplicated', false, 'success'); };
            const archBtn = document.createElement('button'); archBtn.className = 'bm-button'; archBtn.textContent = note.archived ? '↩️ Restore' : '📦 Archive'; archBtn.onclick = async () => { closeMenu(); await NoteService.updateNote(note.id, { archived: !note.archived }); renderNotes(); };
            const delBtn = document.createElement('button'); delBtn.className = 'bm-button'; delBtn.textContent = '🗑️ Delete'; delBtn.onclick = () => { closeMenu(); bmConfirm(`Delete note "${note.title}"?`, (ok) => { if (ok) { NoteService.deleteNote(note.id); if (String(activeNoteId) === String(note.id)) activeNoteId = null; renderNotes(); showFlash('Note deleted', false, 'success'); } }); };
            menu.append(editBtn, pinBtn, dupBtn, archBtn, delBtn);
        });

        const titleEl = document.createElement('div');
        titleEl.textContent = `${note.pinned ? '📌 ' : ''}${note.title || 'Untitled Note'}`;
        Object.assign(titleEl.style, {
            fontWeight: 'bold',
            fontSize: '12px',
            color: '#1976d2',
            textAlign: 'center',
            width: '100%',
            marginTop: '8px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: '2'
        });

        const summary = document.createElement('div');
        summary.className = 'bm-text';
        summary.textContent = getNoteSummary(note);
        Object.assign(summary.style, {
            fontSize: '11px',
            color: '#555',
            lineHeight: '1.25',
            textAlign: 'center',
            width: '100%',
            flex: '1',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: '3',
            wordBreak: 'break-word',
            marginTop: '2px'
        });

        const meta = document.createElement('div');
        meta.className = 'bm-text';
        meta.textContent = formatNoteDate(note.updatedAt);
        Object.assign(meta.style, {
            fontSize: '10px',
            color: '#888',
            marginTop: 'auto',
            textAlign: 'center'
        });

        card.addEventListener('click', () => {
            if (activeNoteId !== note.id) {
                activeNoteId = note.id;
                renderNotes();
            } else {
                showNoteEditor(note);
            }
        });

        card.addEventListener('dblclick', () => {
            showNoteEditor(note);
        });

        card.append(batchCheckbox, menuIcon, titleEl, summary, meta);

        return card;
    }

    async function renderNotes(options = {}) {
        const isFormOpen = noteFormWrapper.style.display !== 'none' && noteFormWrapper.innerHTML !== '';
        if (options.backgroundSync && isFormOpen) {
            const select = noteFormWrapper.querySelector('select');
            if (select) {
                const currentVal = select.value;
                populateNoteFolderSelect(select, currentVal);
            }
        } else {
            noteFormWrapper.style.display = 'none';
            noteDisplay.style.display = 'flex';
        }
        noteDisplay.innerHTML = '';

        const toolbar = document.createElement('div');
        Object.assign(toolbar.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            width: '100%',
            flexWrap: 'wrap'
        });

        const newBtn = document.createElement('button');
        newBtn.className = 'bm-button';
        newBtn.textContent = '+ New Note';
        newBtn.addEventListener('click', () => showNoteEditor());

        const newFolderBtn = document.createElement('button');
        newFolderBtn.className = 'bm-button';
        newFolderBtn.textContent = '+ Folder';
        newFolderBtn.addEventListener('click', () => {
            showNewFolderModal((name) => {
                if (!name) return;
                const ok = NoteService.createNoteFolder(name);
                if (ok) {
                    activeNoteFolder = name;
                    renderNotes();
                }
            });
        });

        const archiveBtn = document.createElement('button');
        archiveBtn.className = 'bm-button';
        archiveBtn.textContent = showArchivedNotes ? 'Active Notes' : 'Archive';
        archiveBtn.addEventListener('click', () => {
            showArchivedNotes = !showArchivedNotes;
            renderNotes();
        });

        const sortSelect = document.createElement('select');
        sortSelect.className = 'bm-input';
        sortSelect.style.flex = '1 1 140px';
        sortSelect.style.minWidth = '130px';
        sortSelect.style.padding = '4px 6px';
        [
            ['updated-desc', 'Updated'],
            ['created-desc', 'Newest'],
            ['created-asc', 'Oldest'],
            ['title', 'Title']
        ].forEach(([value, label]) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = `Sort: ${label}`;
            sortSelect.appendChild(opt);
        });
        sortSelect.value = noteSortMode;
        sortSelect.addEventListener('change', () => {
            noteSortMode = sortSelect.value;
            renderNotes();
        });

        toolbar.append(newBtn, newFolderBtn, archiveBtn, sortSelect);
        noteDisplay.appendChild(toolbar);

        const allNotes = NoteService.getNotes();
        const allFolders = NoteService.getNoteFolders().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.name.localeCompare(b.name));
        let notes = allNotes.filter(note => !!note.archived === !!showArchivedNotes);
        if (!noteSearchQuery && activeNoteFolder) {
            notes = notes.filter(note => note.folderId === activeNoteFolder);
        }
        notes = NoteService.searchNotes(notes, noteSearchQuery);
        notes = NoteService.sortNotes(notes, noteSortMode);

        if (!allNotes.length && !allFolders.length && !noteSearchQuery && !showArchivedNotes) {
            noteDisplay.appendChild(createFeatureWelcomeState({
                title: '📓 Notebook',
                description: 'Capture quick notes without leaving PA.',
                examples: ['Shift notes', 'Troubleshooting steps', 'Useful commands', 'Meeting notes'],
                buttonText: '+ Add First Note',
                onButtonClick: () => showNoteEditor(),
                features: ['Plain text', 'Folders', 'Tags', 'Search', 'Archive']
            }));
            return;
        }

        if (!noteSearchQuery && !activeNoteFolder && !showArchivedNotes) {
            if (!allFolders.length && allNotes.length) {
                activeNoteFolder = allNotes[0].folderId || null;
                renderNotes();
                return;
            }
            const folderGrid = document.createElement('div');
            Object.assign(folderGrid.style, {
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
                width: '100%',
                alignContent: 'flex-start',
                justifyContent: 'flex-start'
            });
            allFolders.forEach(folder => {
                const count = allNotes.filter(note => !note.archived && note.folderId === folder.name).length;
                const wrapper = document.createElement('div');
                wrapper.className = 'bm-folder-icon-wrapper';
                wrapper.title = `${folder.name} (${count})`;
                wrapper.appendChild(createBookmarkFolderIcon(count > 0, false));
                const label = document.createElement('div');
                label.className = 'bm-folder-label';
                label.textContent = folder.pinned ? `📌 ${folder.name}` : folder.name;
                wrapper.appendChild(label);
                wrapper.addEventListener('dblclick', () => {
                    activeNoteFolder = folder.name;
                    renderNotes();
                });
                wrapper.addEventListener('click', () => {
                    activeNoteFolder = folder.name;
                    renderNotes();
                });
                const menuIcon = document.createElement('div');
                menuIcon.textContent = '⋮';
                menuIcon.className = 'bm-folder-menu-icon';
                menuIcon.style.position = 'absolute';
                menuIcon.style.top = '2px';
                menuIcon.style.right = '2px';
                menuIcon.addEventListener('click', e => {
                    e.stopPropagation();
                    closeAllContextMenus();
                    const menu = buildContextMenu('bm-folder-menu-open');
                    const closeMenu = openContextMenuAtEvent(menu, e, menuIcon, () => { });

                    const renameBtn = document.createElement('button');
                    renameBtn.className = 'bm-button';
                    renameBtn.textContent = '✏️ Rename';
                    renameBtn.onclick = () => { closeMenu(); showRenameModal(folder.name, n => { if (n) { NoteService.renameNoteFolder(folder.name, n); renderNotes(); } }); };

                    const pinBtn = document.createElement('button');
                    pinBtn.className = 'bm-button';
                    pinBtn.textContent = folder.pinned ? '📌 Unpin' : '📍 Pin';
                    pinBtn.onclick = () => { closeMenu(); NoteService.updateNoteFolder(folder.name, { pinned: !folder.pinned }); renderNotes(); };

                    const delBtn = document.createElement('button');
                    delBtn.className = 'bm-button';
                    delBtn.textContent = '🗑️ Delete';
                    delBtn.onclick = () => { closeMenu(); bmConfirm(`Delete notebook folder "${folder.name}" and ALL its notes?`, ok => { if (ok) { NoteService.deleteNoteFolder(folder.name); renderNotes(); } }); };

                    menu.append(renameBtn, pinBtn, delBtn);
                });
                wrapper.appendChild(menuIcon);
                folderGrid.appendChild(wrapper);
            });
            noteDisplay.appendChild(folderGrid);
            return;
        }

        if (!noteSearchQuery && activeNoteFolder) {
            const headerRow = document.createElement('div');
            Object.assign(headerRow.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', width: '100%', marginBottom: '2px' });
            const backBtn = document.createElement('button');
            backBtn.className = 'bm-button';
            backBtn.textContent = '⬅Back';
            backBtn.addEventListener('click', () => {
                activeNoteFolder = null;
                activeNoteId = null;
                renderNotes();
            });
            const titleDiv = document.createElement('div');
            titleDiv.className = 'bm-header';
            titleDiv.style.margin = '0';
            titleDiv.style.flex = '1';
            titleDiv.textContent = activeNoteFolder;
            headerRow.append(backBtn, titleDiv);
            noteDisplay.appendChild(headerRow);
        }

        if (!notes.length) {
            const empty = document.createElement('div');
            empty.className = 'bm-text';
            empty.style.textAlign = 'center';
            empty.style.color = '#888';
            empty.style.padding = '18px 0';
            empty.textContent = showArchivedNotes ? 'Archive is empty.' : 'No notes found.';
            noteDisplay.appendChild(empty);
            return;
        }

        if (selectedNoteIds.size > 0 && notes.length > 0) {
            const selectedCount = selectedNoteIds.size;
            const batchBar = document.createElement('div');
            Object.assign(batchBar.style, {
                display: 'flex', gap: '6px', width: '100%', marginBottom: '8px', padding: '6px',
                background: '#e3f2fd', borderRadius: '4px', alignItems: 'center'
            });

            const selInfo = document.createElement('span');
            selInfo.style.flex = '1';
            selInfo.style.fontSize = '12px';
            selInfo.style.fontWeight = 'bold';
            selInfo.textContent = `${selectedCount} selected`;

            const selectAllBtn = document.createElement('button');
            selectAllBtn.className = 'bm-batch-btn';
            selectAllBtn.textContent = '☑️';
            selectAllBtn.title = 'Select All in view';
            selectAllBtn.addEventListener('click', () => {
                const allSelected = notes.every(n => selectedNoteIds.has(String(n.id)));
                if (allSelected) {
                    notes.forEach(n => selectedNoteIds.delete(String(n.id)));
                } else {
                    notes.forEach(n => selectedNoteIds.add(String(n.id)));
                }
                renderNotes();
            });

            const moveBtn = document.createElement('button');
            moveBtn.className = 'bm-batch-btn';
            moveBtn.textContent = '📂';
            moveBtn.title = `Move (${selectedCount})`;
            moveBtn.addEventListener('click', () => {
                showNoteBatchMoveModal(Array.from(selectedNoteIds));
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'bm-batch-btn';
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = `Delete (${selectedCount})`;
            deleteBtn.addEventListener('click', () => {
                bmConfirm(`Delete ${selectedCount} selected note(s)?`, async (ok) => {
                    if (!ok) return;
                    Array.from(selectedNoteIds).forEach(id => {
                        NoteService.deleteNote(id);
                        if (String(activeNoteId) === String(id)) activeNoteId = null;
                    });
                    selectedNoteIds.clear();
                    renderNotes();
                    showFlash('Selected notes deleted', false, 'success');
                });
            });

            batchBar.append(selInfo, selectAllBtn, moveBtn, deleteBtn);
            noteDisplay.appendChild(batchBar);
        }

        const list = document.createElement('div');
        Object.assign(list.style, {
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: '8px',
            width: '100%',
            alignContent: 'flex-start',
            justifyContent: 'flex-start'
        });
        notes.forEach(note => list.appendChild(createNoteCard(note)));
        noteDisplay.appendChild(list);
    }

    renderNotes();

    // --- Todo List Tab Implementation ---
    const todoTabContent = document.createElement('div');
    todoTabContent.className = 'bm-todo-container';
    Object.assign(todoTabContent.style, {
        flexDirection: 'column',
        flex: '1 1 auto',
        minHeight: '0',
        width: '100%',
    });

    // Global Filter/Search State
    let currentFilter = 'active'; // 'all' | 'active' | 'completed'
    let currentProjectFilter = 'all';
    let currentTagFilter = 'all';
    let currentSort = 'priority'; // 'priority' | 'dueDate' | 'created'
    let taskSearchQuery = '';
    let showingArchive = false;

    // 1. Filter and Header controls bar
    const filterBar = document.createElement('div');
    filterBar.className = 'bm-todo-filters';

    const filterGroup = document.createElement('div');
    filterGroup.className = 'bm-todo-filter-group';

    const filterButtons = [];
    const filters = [
        { id: 'all', label: 'All' },
        { id: 'active', label: 'Active' },
        { id: 'completed', label: 'Done' }
    ];

    filters.forEach(f => {
        const btn = document.createElement('button');
        btn.className = `bm-todo-filter-btn${f.id === currentFilter ? ' active' : ''}`;
        btn.textContent = f.label;
        btn.addEventListener('click', () => {
            if (showingArchive) {
                showingArchive = false;
                todoTopSection.style.setProperty('display', 'flex', 'important');
                archiveBtn.style.color = '';
            }
            currentFilter = f.id;
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderTasksList();
        });
        filterGroup.appendChild(btn);
        filterButtons.push(btn);
    });
    filterBar.appendChild(filterGroup);

    // Wellness quick toggles live in the middle of bm-todo-filters.
    const wellnessToggleGroup = document.createElement('div');
    wellnessToggleGroup.className = 'bm-todo-wellness-toggles';

    const waterToggleBtn = document.createElement('button');
    waterToggleBtn.type = 'button';
    waterToggleBtn.className = 'bm-todo-wellness-btn';
    waterToggleBtn.id = 'bm-water-toggle-btn';
    waterToggleBtn.innerHTML = '💧 Water <span class="wt-icon" style="visibility:hidden; display:inline-block; width:16px; text-align:center; font-size:10px;">⏱️<span class="wt-tooltip"></span></span>';

    const stretchToggleBtn = document.createElement('button');
    stretchToggleBtn.type = 'button';
    stretchToggleBtn.className = 'bm-todo-wellness-btn';
    stretchToggleBtn.id = 'bm-stretch-toggle-btn';
    stretchToggleBtn.innerHTML = '🧘 Break <span class="wt-icon" style="visibility:hidden; display:inline-block; width:16px; text-align:center; font-size:10px;">⏱️<span class="wt-tooltip"></span></span>';

    function updateWellnessTodoToggleButtons() {
        const settings = getWellnessSettings();
        waterToggleBtn.classList.toggle('active', !!settings.waterEnabled);
        stretchToggleBtn.classList.toggle('active', !!settings.stretchEnabled);
        waterToggleBtn.title = settings.waterEnabled
            ? `Water reminder on — every ${settings.waterIntervalMinutes} min`
            : 'Water reminder off';
        stretchToggleBtn.title = settings.stretchEnabled
            ? `Stretch break on — work ${settings.workMinutes} min, rest ${settings.breakMinutes} min`
            : 'Stretch break off';
    }

    waterToggleBtn.addEventListener('click', () => {
        const settings = getWellnessSettings();
        setWellnessToggle(settings, 'waterEnabled', !settings.waterEnabled, getWellnessWaterIntervalMs(settings));
        saveWellnessSettings(settings);
        initReminderChecker();
        updateWellnessTodoToggleButtons();
        showFlash(settings.waterEnabled ? 'Water reminder enabled' : 'Water reminder disabled', false, 'success');
    });

    stretchToggleBtn.addEventListener('click', () => {
        const settings = getWellnessSettings();
        setWellnessToggle(settings, 'stretchEnabled', !settings.stretchEnabled, getWellnessStretchIntervalMs(settings));
        saveWellnessSettings(settings);
        initReminderChecker();
        updateWellnessTodoToggleButtons();
        showFlash(settings.stretchEnabled ? 'Stretch break enabled' : 'Stretch break disabled', false, 'success');
    });

    wellnessToggleGroup.style.display = 'flex';
    wellnessToggleGroup.style.gap = '16px';
    wellnessToggleGroup.style.alignItems = 'center';
    wellnessToggleGroup.append(waterToggleBtn, stretchToggleBtn);

    refreshWellnessTodoToggles = updateWellnessTodoToggleButtons;
    updateWellnessTodoToggleButtons();
    filterBar.appendChild(wellnessToggleGroup);

    // Header actions (Archive Toggle & Insights)
    const headerActions = document.createElement('div');
    headerActions.className = 'bm-todo-header-actions';

    const insightsBtn = document.createElement('button');
    insightsBtn.className = 'bm-todo-header-btn';
    insightsBtn.innerHTML = '📈';
    insightsBtn.title = 'Productivity Insights';
    insightsBtn.addEventListener('click', showInsightsModal);

    const archiveBtn = document.createElement('button');
    archiveBtn.className = 'bm-todo-header-btn';
    archiveBtn.innerHTML = '📦';
    archiveBtn.title = 'View Archive';
    archiveBtn.addEventListener('click', () => {
        showingArchive = !showingArchive;
        if (showingArchive) {
            todoTopSection.style.setProperty('display', 'none', 'important');
            archiveBtn.style.color = '#1f4e79';
            filterButtons.forEach(b => b.classList.remove('active'));
        } else {
            todoTopSection.style.setProperty('display', 'flex', 'important');
            archiveBtn.style.color = '';
            currentFilter = 'active';
            const activeBtn = filterButtons.find(b => b.textContent === 'Active');
            if (activeBtn) activeBtn.classList.add('active');
        }
        renderTasksList();
    });

    headerActions.appendChild(insightsBtn);
    headerActions.appendChild(archiveBtn);
    filterBar.appendChild(headerActions);
    todoTabContent.appendChild(filterBar);

    let taskSnoozeUiRefs = new Map();

    // 1.5 Advanced Filter and Search Bar
    const searchFilterBar = document.createElement('div');
    searchFilterBar.style.display = 'flex';
    searchFilterBar.style.gap = '4px';
    searchFilterBar.style.width = '100%';
    searchFilterBar.style.marginBottom = '4px';

    const taskSearch = document.createElement('input');
    taskSearch.type = 'text';
    taskSearch.placeholder = 'Search tasks...';
    taskSearch.className = 'bm-todo-input';
    taskSearch.style.padding = '4px 6px';
    taskSearch.style.fontSize = '11px';
    taskSearch.addEventListener('input', () => {
        taskSearchQuery = taskSearch.value.trim().toLowerCase();
        renderTasksList();
    });

    const projectFilterSelect = document.createElement('select');
    projectFilterSelect.className = 'bm-todo-select';
    projectFilterSelect.style.fontSize = '11px';
    projectFilterSelect.style.padding = '3px';
    projectFilterSelect.addEventListener('change', () => {
        currentProjectFilter = projectFilterSelect.value;
        renderTasksList();
    });

    const tagFilterSelect = document.createElement('select');
    tagFilterSelect.className = 'bm-todo-select';
    tagFilterSelect.style.fontSize = '11px';
    tagFilterSelect.style.padding = '3px';
    tagFilterSelect.addEventListener('change', () => {
        currentTagFilter = tagFilterSelect.value;
        renderTasksList();
    });

    const manageProjectsBtn = document.createElement('button');
    manageProjectsBtn.style.padding = '3px 6px';
    manageProjectsBtn.style.fontSize = '12px';
    manageProjectsBtn.style.cursor = 'pointer';
    manageProjectsBtn.style.display = 'flex';
    manageProjectsBtn.style.alignItems = 'center';
    manageProjectsBtn.style.justifyContent = 'center';
    manageProjectsBtn.style.border = '1px solid #ccc';
    manageProjectsBtn.style.borderRadius = '4px';
    manageProjectsBtn.style.backgroundColor = '#f5f5f5';
    manageProjectsBtn.style.color = '#333';
    manageProjectsBtn.style.flex = '0 0 auto';
    manageProjectsBtn.textContent = '⚙️';
    manageProjectsBtn.title = 'Manage Folders';
    manageProjectsBtn.addEventListener('click', showManageProjectsModal);

    const sortSelect = document.createElement('select');
    sortSelect.className = 'bm-todo-select';
    sortSelect.style.fontSize = '11px';
    sortSelect.style.padding = '3px';
    sortSelect.innerHTML = `
        <option value="priority" selected>Sort by Priority</option>
        <option value="dueDate">Sort by Due Date</option>
        <option value="created">Sort by Date Created</option>
    `;
    sortSelect.addEventListener('change', () => {
        currentSort = sortSelect.value;
        renderTasksList();
    });

    searchFilterBar.appendChild(taskSearch);
    searchFilterBar.appendChild(projectFilterSelect);
    searchFilterBar.appendChild(tagFilterSelect);
    searchFilterBar.appendChild(sortSelect);

    function showManageProjectsModal() {
        if (panel.querySelector('.bm-modal')) return;

        const body = document.createElement('div');
        body.style.display = 'flex';
        body.style.flexDirection = 'column';
        body.style.gap = '8px';
        body.style.width = '100%';

        const listDiv = document.createElement('div');
        listDiv.style.maxHeight = '200px';
        listDiv.style.overflowY = 'auto';
        listDiv.style.display = 'flex';
        listDiv.style.flexDirection = 'column';
        listDiv.style.gap = '4px';

        const renderProjectsListInModal = () => {
            listDiv.innerHTML = '';
            const projects = getTodoProjects();

            projects.forEach(p => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.justifyContent = 'space-between';
                row.style.padding = '4px 6px';
                row.style.border = '1px solid #eee';
                row.style.borderRadius = '6px';
                row.style.backgroundColor = '#fafafa';

                const contentWrapper = document.createElement('div');
                contentWrapper.style.flex = '1';
                contentWrapper.style.marginRight = '8px';
                contentWrapper.style.display = 'flex';
                contentWrapper.style.alignItems = 'center';

                const nameSpan = document.createElement('span');
                nameSpan.textContent = p;
                nameSpan.style.fontSize = '13px';
                nameSpan.style.color = '#333';
                contentWrapper.appendChild(nameSpan);

                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.gap = '4px';

                const renameBtn = document.createElement('button');
                renameBtn.className = 'bm-todo-pomo-btn';
                renameBtn.textContent = '✏️';
                renameBtn.style.padding = '2px 4px';
                renameBtn.style.fontSize = '11px';
                renameBtn.style.cursor = 'pointer';

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'bm-todo-pomo-btn';
                deleteBtn.textContent = '❌';
                deleteBtn.style.padding = '2px 4px';
                deleteBtn.style.fontSize = '11px';
                deleteBtn.style.cursor = 'pointer';

                let editInput = null;

                renameBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (editInput) return;

                    editInput = document.createElement('input');
                    editInput.type = 'text';
                    editInput.value = p;
                    editInput.className = 'bm-todo-field-input';
                    editInput.style.fontSize = '12px';
                    editInput.style.padding = '2px 4px';
                    editInput.style.width = '100%';
                    editInput.style.boxSizing = 'border-box';

                    contentWrapper.innerHTML = '';
                    contentWrapper.appendChild(editInput);
                    editInput.focus();

                    const saveBtn = renameBtn.cloneNode(true);
                    saveBtn.textContent = '💾';

                    const cancelBtn = deleteBtn.cloneNode(true);
                    cancelBtn.textContent = '↩️';

                    const saveHandler = (e2) => {
                        e2.stopPropagation();
                        const val = editInput.value.trim();
                        if (!val) {
                            showFlash('Project name cannot be empty', false, 'error');
                            return;
                        }
                        if (val.toLowerCase() === p.toLowerCase()) {
                            renderProjectsListInModal();
                            return;
                        }
                        const ok = renameTodoProject(p, val);
                        if (ok) {
                            showFlash(`Renamed to "${val}"`, false, 'success');
                            if (currentProjectFilter === p) {
                                currentProjectFilter = val;
                            }
                            renderProjectsListInModal();
                            populateProjectSelects();
                            renderTasksList();
                        } else {
                            showFlash('Project already exists or rename failed', false, 'error');
                        }
                    };

                    const cancelHandler = (e2) => {
                        e2.stopPropagation();
                        renderProjectsListInModal();
                    };

                    saveBtn.addEventListener('click', saveHandler);
                    cancelBtn.addEventListener('click', cancelHandler);

                    editInput.addEventListener('keydown', keyEvent => {
                        if (keyEvent.key === 'Enter') {
                            saveHandler(keyEvent);
                        } else if (keyEvent.key === 'Escape') {
                            cancelHandler(keyEvent);
                        }
                    });

                    actions.innerHTML = '';
                    actions.appendChild(saveBtn);
                    actions.appendChild(cancelBtn);
                });

                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const projectsList = getTodoProjects();
                    if (projectsList.length <= 1) {
                        showFlash('Cannot delete the last project', false, 'error');
                        return;
                    }

                    const confirmSpan = document.createElement('span');
                    confirmSpan.textContent = 'Delete? ';
                    confirmSpan.style.fontSize = '12px';
                    confirmSpan.style.color = '#d32f2f';
                    confirmSpan.style.fontWeight = 'bold';

                    contentWrapper.innerHTML = '';
                    contentWrapper.appendChild(confirmSpan);

                    const yesBtn = renameBtn.cloneNode(true);
                    yesBtn.textContent = 'Yes';
                    yesBtn.style.backgroundColor = '#d32f2f';
                    yesBtn.style.color = '#fff';

                    const noBtn = deleteBtn.cloneNode(true);
                    noBtn.textContent = 'No';

                    const yesHandler = (e2) => {
                        e2.stopPropagation();
                        const ok = deleteTodoProject(p);
                        if (ok) {
                            showFlash(`Deleted project "${p}"`, false, 'success');
                            if (currentProjectFilter === p) {
                                currentProjectFilter = 'all';
                            }
                            renderProjectsListInModal();
                            populateProjectSelects();
                            renderTasksList();
                        } else {
                            showFlash('Failed to delete project', false, 'error');
                        }
                    };

                    const noHandler = (e2) => {
                        e2.stopPropagation();
                        renderProjectsListInModal();
                    };

                    yesBtn.addEventListener('click', yesHandler);
                    noBtn.addEventListener('click', noHandler);

                    actions.innerHTML = '';
                    actions.appendChild(yesBtn);
                    actions.appendChild(noBtn);
                });

                actions.appendChild(renameBtn);
                actions.appendChild(deleteBtn);
                row.appendChild(contentWrapper);
                row.appendChild(actions);
                listDiv.appendChild(row);
            });
        };

        renderProjectsListInModal();
        body.appendChild(listDiv);

        const addRow = document.createElement('div');
        addRow.style.display = 'flex';
        addRow.style.gap = '4px';
        addRow.style.marginTop = '6px';

        const addInput = document.createElement('input');
        addInput.type = 'text';
        addInput.placeholder = 'New project name...';
        addInput.className = 'bm-todo-field-input';
        addInput.style.flex = '1';
        addInput.style.fontSize = '12px';
        addInput.style.padding = '4px';

        const addSubmitBtn = document.createElement('button');
        addSubmitBtn.className = 'bm-todo-add-btn';
        addSubmitBtn.textContent = '➕';
        addSubmitBtn.style.padding = '4px 8px';
        addSubmitBtn.addEventListener('click', () => {
            const val = addInput.value.trim();
            if (!val) return;
            const ok = addTodoProject(val);
            if (ok) {
                showFlash(`Added project "${val}"`, false, 'success');
                addInput.value = '';
                renderProjectsListInModal();
                populateProjectSelects();
                renderTasksList();
            } else {
                showFlash('Project already exists', false, 'error');
            }
        });

        addRow.appendChild(addInput);
        addRow.appendChild(addSubmitBtn);
        body.appendChild(addRow);

        createCustomModal('📁 Manage Todo Projects', body);
    }

    function updateProjectAndTagDropdowns() {
        const tasks = getTasks();
        const projects = new Set(getTodoProjects());
        tasks.forEach(t => {
            if (t.project) projects.add(t.project);
        });

        projectFilterSelect.innerHTML = '<option value="all">📁 All Projects</option>';
        projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = `📁 ${p}`;
            if (p === currentProjectFilter) opt.selected = true;
            projectFilterSelect.appendChild(opt);
        });

        const tags = new Set();
        tasks.forEach(t => {
            if (Array.isArray(t.tags)) {
                t.tags.forEach(tag => tags.add(tag));
            }
        });

        tagFilterSelect.innerHTML = '<option value="all">🏷️ All Tags</option>';
        tags.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = `#${t}`;
            if (t === currentTagFilter) opt.selected = true;
            tagFilterSelect.appendChild(opt);
        });
    }

    // 2. Task List container
    const todoListContainer = document.createElement('div');
    todoListContainer.className = 'bm-todo-list';

    // 3. Add form
    const todoForm = document.createElement('div');
    todoForm.className = 'bm-todo-form';

    // Form Row 1: Input text + Add button
    const formRow1 = document.createElement('div');
    formRow1.className = 'bm-todo-form-row';

    const taskInput = document.createElement('input');
    taskInput.type = 'text';
    taskInput.placeholder = 'New task (supports NLP: tomorrow at 6pm #work)...';
    taskInput.className = 'bm-todo-input';

    const addBtn = document.createElement('button');
    addBtn.className = 'bm-todo-add-btn';
    addBtn.textContent = '➕';

    formRow1.appendChild(taskInput);
    formRow1.appendChild(addBtn);
    todoForm.appendChild(formRow1);

    // NLP Preview element
    const nlpPreview = document.createElement('div');
    nlpPreview.className = 'bm-todo-nlp-preview';
    todoForm.appendChild(nlpPreview);

    // Manual date and time input picker (dateInput)
    const dateInput = document.createElement('input');
    dateInput.type = 'datetime-local';
    dateInput.className = 'bm-todo-select';
    dateInput.style.flex = '1 1 120px';
    dateInput.style.width = '100%';
    dateInput.style.minWidth = '110px';
    dateInput.style.maxWidth = '200px';
    dateInput.style.color = '#333 !important';
    dateInput.style.backgroundColor = '#fff !important';
    dateInput.style.border = '1px solid #ccc !important';
    dateInput.style.borderRadius = '6px !important';
    dateInput.style.padding = '4px !important';

    function formatLocalDateToHTML(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        const h = String(dateObj.getHours()).padStart(2, '0');
        const min = String(dateObj.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d}T${h}:${min}`;
    }

    taskInput.addEventListener('input', () => {
        const val = taskInput.value.trim();
        if (!val) {
            nlpPreview.style.setProperty('display', 'none', 'important');
            return;
        }
        const parsed = parseTaskTextWithNLP(val);
        if (parsed.dueDate || parsed.tags.length > 0) {
            let html = '';
            if (parsed.dueDate) {
                const d = new Date(parsed.dueDate);
                html += `📅 ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                dateInput.value = formatLocalDateToHTML(d);
            }
            if (parsed.tags.length > 0) {
                if (html) html += ' | ';
                html += `🏷️ ${parsed.tags.map(t => '#' + t).join(' ')}`;
            }
            nlpPreview.innerHTML = html;
            nlpPreview.style.setProperty('display', 'flex', 'important');
        } else {
            nlpPreview.style.setProperty('display', 'none', 'important');
        }
    });

    // Form Row 2: Priority + Project + Date picker
    const formRow2 = document.createElement('div');
    formRow2.className = 'bm-todo-form-row';
    formRow2.style.justifyContent = 'space-between';

    const prioritySelect = document.createElement('select');
    prioritySelect.className = 'bm-todo-select';
    prioritySelect.style.flex = '0 0 auto';
    prioritySelect.innerHTML = `
        <option value="P1">🔴 P1</option>
        <option value="P2">🟡 P2</option>
        <option value="P3">🟢 P3</option>
        <option value="P4" selected>⚪ P4</option>
    `;

    const projectSelect = document.createElement('select');
    projectSelect.className = 'bm-todo-select';
    projectSelect.style.flex = '1 1 90px';
    projectSelect.style.minWidth = '90px';

    projectSelect.addEventListener('change', () => {
        if (projectSelect.value === '__manage__') {
            showManageProjectsModal();
            // Revert selection back to Default or first project
            projectSelect.value = getTodoProjects()[0] || 'Default';
        }
    });

    function populateMainProjectSelect() {
        projectSelect.innerHTML = '';
        const projects = getTodoProjects();
        projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = `📁 ${p}`;
            projectSelect.appendChild(opt);
        });

        const manageOpt = document.createElement('option');
        manageOpt.value = '__manage__';
        manageOpt.textContent = '⚙️ Manage Folders...';
        projectSelect.appendChild(manageOpt);
    }

    function populateProjectSelects() {
        populateMainProjectSelect();
        updateProjectAndTagDropdowns();
    }

    // Initialize projects list
    populateMainProjectSelect();

    // Trigger date picker when input is clicked anywhere
    dateInput.addEventListener('click', (e) => {
        if (typeof dateInput.showPicker === 'function') {
            try {
                dateInput.showPicker();
            } catch (err) { }
        }
    });

    formRow2.appendChild(prioritySelect);
    formRow2.appendChild(projectSelect);
    formRow2.appendChild(dateInput);
    todoForm.appendChild(formRow2);

    const todoTopSection = document.createElement('div');
    Object.assign(todoTopSection.style, { display: 'flex', flexWrap: 'nowrap', gap: '8px', alignItems: 'stretch' });
    todoForm.style.flex = '1 1 0';
    todoForm.style.minWidth = '0';

    const globalTimerUi = document.createElement('div');
    globalTimerUi.className = 'bm-todo-form';
    Object.assign(globalTimerUi.style, { flex: '0 1 auto', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center', justifyContent: 'center', padding: '8px' });

    const gtHeader = document.createElement('div');
    gtHeader.textContent = '⏱️ Timer';
    gtHeader.style.fontWeight = 'bold';
    gtHeader.style.fontSize = '12px';
    gtHeader.style.color = '#1f4e79';

    const gtSelectRow = document.createElement('div');
    Object.assign(gtSelectRow.style, { display: 'flex', gap: '4px', alignItems: 'center' });

    const gtSelect = document.createElement('select');
    gtSelect.className = 'bm-todo-select';
    gtSelect.style.padding = '4px';
    [5, 10, 15, 25, 30, 45, 60].forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = `${m}m`;
        if (m === 25) opt.selected = true;
        gtSelect.appendChild(opt);
    });

    const gtCustomOpt = document.createElement('option');
    gtCustomOpt.value = 'custom';
    gtCustomOpt.textContent = 'Custom...';
    gtSelect.appendChild(gtCustomOpt);

    function showCustomTimerModal(callback) {
        const modal = document.createElement('div');
        modal.className = 'bm-modal';
        modal.dataset.noAutoclose = '1';
        Object.assign(modal.style, {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            borderRadius: '8px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
            padding: '16px',
            zIndex: '10001',
            minWidth: '220px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
        });

        const header = document.createElement('div');
        header.className = 'bm-text';
        header.textContent = '⏱️ Custom Timer';
        header.style.fontWeight = 'bold';
        header.style.fontSize = '14px';

        const inputRow = document.createElement('div');
        Object.assign(inputRow.style, { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' });

        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'bm-todo-input';
        input.style.width = '70px';
        input.style.textAlign = 'center';
        input.min = '1';
        input.value = '10';

        const label = document.createElement('div');
        label.className = 'bm-text';
        label.textContent = 'minutes';

        inputRow.append(input, label);

        const btnRow = document.createElement('div');
        Object.assign(btnRow.style, { display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '4px' });

        const okBtn = document.createElement('button');
        okBtn.className = 'bm-button';
        okBtn.textContent = 'Set Timer';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-button';
        cancelBtn.textContent = 'Cancel';

        const submit = () => {
            const mins = parseInt(input.value, 10);
            if (!isNaN(mins) && mins > 0) {
                modal.remove();
                callback(mins);
            }
        };

        okBtn.addEventListener('click', submit);
        cancelBtn.addEventListener('click', () => { modal.remove(); callback(null); });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') { modal.remove(); callback(null); }
        });

        btnRow.append(okBtn, cancelBtn);
        modal.append(header, inputRow, btnRow);

        // Append inside panel to restrict scope to the extension UI
        const panelEl = document.querySelector('.bm-panel');
        if (panelEl) {
            panelEl.appendChild(modal);
        } else {
            document.body.appendChild(modal);
        }
        input.focus();
        input.select();
    }

    gtSelect.addEventListener('change', () => {
        if (gtSelect.value === 'custom') {
            showCustomTimerModal((mins) => {
                if (mins) {
                    const newOpt = document.createElement('option');
                    newOpt.value = mins;
                    newOpt.textContent = `${mins}m`;
                    gtSelect.insertBefore(newOpt, gtCustomOpt);
                    gtSelect.value = mins;
                } else {
                    gtSelect.value = '25'; // fallback
                }
            });
        }
    });

    const gtStartBtn = document.createElement('button');
    gtStartBtn.className = 'bm-todo-add-btn';
    gtStartBtn.textContent = '▶️';
    gtStartBtn.title = 'Start timer';
    gtStartBtn.style.padding = '4px 8px';

    const gtStopBtn = document.createElement('button');
    gtStopBtn.className = 'bm-todo-delete-btn';
    gtStopBtn.textContent = '⏹';
    gtStopBtn.title = 'Stop timer';
    gtStopBtn.style.padding = '4px 8px';
    gtStopBtn.style.display = 'none';

    const gtDisplay = document.createElement('div');
    gtDisplay.style.fontWeight = 'bold';
    gtDisplay.style.color = '#1f4e79';
    gtDisplay.style.fontSize = '18px';
    gtDisplay.textContent = '00:00';
    gtDisplay.style.display = 'none';

    gtStartBtn.addEventListener('click', () => {
        const mins = parseInt(gtSelect.value, 10);
        globalTimerEndMs = Date.now() + mins * 60000;
        localStorage.setItem('PA_GLOBAL_TIMER', globalTimerEndMs);
        globalTimerNotified = false;
        updateReminderCountdownDisplays();
    });

    gtStopBtn.addEventListener('click', () => {
        globalTimerEndMs = null;
        localStorage.removeItem('PA_GLOBAL_TIMER');
        updateReminderCountdownDisplays();
    });

    updateGlobalTimerUi = function (text, isRunning) {
        if (isRunning) {
            gtDisplay.textContent = text;
            gtDisplay.style.display = 'block';
            gtSelect.style.display = 'none';
            gtStartBtn.style.display = 'none';
            gtStopBtn.style.display = 'inline-block';
        } else {
            gtDisplay.style.display = 'none';
            gtSelect.style.display = 'inline-block';
            gtStartBtn.style.display = 'inline-block';
            gtStopBtn.style.display = 'none';
        }
    };

    gtSelectRow.append(gtSelect, gtStartBtn, gtStopBtn);
    globalTimerUi.append(gtHeader, gtDisplay, gtSelectRow);

    todoTopSection.append(todoForm, globalTimerUi);

    // Append Form first, then List container (places Form on top)
    todoTabContent.appendChild(todoTopSection);
    todoTabContent.appendChild(todoListContainer);

    registerTab('todo', '📋 Todo', todoTabContent);

    const todoTabButton = tabsMap.get('todo').button;

    updateTaskTabBadge = function () {
        const tasks = getTasks();
        const activeCount = tasks.filter(t => !t.completed && !t.archived).length;
        const pendingReminderCount = getPendingTaskReminderCount(tasks);
        if (activeCount > 0 || pendingReminderCount > 0) {
            const parts = [];
            if (activeCount > 0) parts.push(String(activeCount));
            if (pendingReminderCount > 0) parts.push(`🔔${pendingReminderCount}`);
            todoTabButton.textContent = `📋 Todo (${parts.join(' • ')})`;
        } else {
            todoTabButton.textContent = '📋 Todo';
        }
    };

    let updateReminderCountdownDisplays = () => { };
    let reminderCountdownUiTimer = null;

    updateReminderCountdownDisplays = function () {
        const tasks = getTasks();
        const now = Date.now();
        const nearestSnooze = getNearestActiveSnooze(tasks, now);

        const activeSnoozes = new Map(getActiveSnoozedTasks(tasks, now).map(task => [task.id, task]));
        taskSnoozeUiRefs.forEach((ref, taskId) => {
            const task = activeSnoozes.get(taskId);
            if (task) {
                ref.wrap.style.display = 'inline-flex';
                ref.time.textContent = formatCountdownClock(Math.max(0, new Date(task.snoozedUntil).getTime() - now));
                ref.wrap.title = `Snoozed: ${task.title}`;
            } else {
                ref.wrap.style.display = 'none';
                ref.time.textContent = '';
                ref.wrap.title = '';
            }
        });

        if (nearestSnooze) {
            const countdownText = formatCountdownClock(nearestSnooze.remainingMs);
            const snoozeTitle = nearestSnooze.count > 1
                ? `${nearestSnooze.count} snoozed tasks active. Next: ${nearestSnooze.task.title}`
                : `Snoozed task: ${nearestSnooze.task.title}`;
            floatingSnoozeLabel.style.display = 'block';
            floatingSnoozeLabel.textContent = `⏰ ${countdownText}`;
            floatingSnoozeLabel.title = snoozeTitle;
        } else {
            floatingSnoozeLabel.style.display = 'none';
            floatingSnoozeLabel.textContent = '';
            floatingSnoozeLabel.title = '';
        }

        if (globalTimerEndMs && globalTimerEndMs > now) {
            globalTimerNotified = false;
            const remaining = globalTimerEndMs - now;
            const text = formatCountdownClock(remaining);
            floatingTimerLabel.style.display = 'block';
            floatingTimerLabel.textContent = `⏳ ${text}`;
            floatingTimerLabel.title = 'Global Timer';
            if (typeof updateGlobalTimerUi === 'function') updateGlobalTimerUi(text, true);
        } else {
            floatingTimerLabel.style.display = 'none';
            floatingTimerLabel.textContent = '';
            if (globalTimerEndMs && globalTimerEndMs <= now) {
                globalTimerEndMs = null;
                localStorage.removeItem('PA_GLOBAL_TIMER');
                if (!globalTimerNotified) {
                    globalTimerNotified = true;
                    if (typeof sendAppNotification === 'function') {
                        sendAppNotification({ title: '⏱️ Timer Finished!', body: 'Your selected time is up.', tag: 'pa-timer', fallbackType: 'info' });
                    }
                    if (typeof showFlash === 'function') {
                        showFlash('⏱️ Timer Finished! Your time is up.', true, 'warning');
                    }
                }
            }
            if (typeof updateGlobalTimerUi === 'function') updateGlobalTimerUi('00:00', false);
        }

        const pendingCount = getPendingTaskReminderCount(tasks);
        if (pendingCount > 0) {
            floatingBadge.textContent = pendingCount;
            floatingBadge.style.display = 'block';
        } else {
            floatingBadge.style.display = 'none';
        }

        const wellness = getWellnessSettings();

        const waterBtn = document.getElementById('bm-water-toggle-btn');
        if (waterBtn) {
            const iconSpan = waterBtn.querySelector('.wt-icon');
            const tooltipSpan = waterBtn.querySelector('.wt-tooltip');
            if (wellness.waterEnabled && wellness.waterNextAt) {
                const waterMs = wellness.waterNextAt - now;
                if (tooltipSpan) tooltipSpan.textContent = formatCountdownClock(Math.max(0, waterMs));
                iconSpan.style.visibility = 'visible';
            } else {
                if (tooltipSpan) tooltipSpan.textContent = '';
                iconSpan.style.visibility = 'hidden';
            }
        }

        const stretchBtn = document.getElementById('bm-stretch-toggle-btn');
        if (stretchBtn) {
            const iconSpan = stretchBtn.querySelector('.wt-icon');
            const tooltipSpan = stretchBtn.querySelector('.wt-tooltip');
            if (wellness.stretchEnabled && wellness.stretchNextAt) {
                const stretchMs = wellness.stretchNextAt - now;
                if (tooltipSpan) tooltipSpan.textContent = formatCountdownClock(Math.max(0, stretchMs));
                iconSpan.style.visibility = 'visible';
            } else {
                if (tooltipSpan) tooltipSpan.textContent = '';
                iconSpan.style.visibility = 'hidden';
            }
        }
    };

    function startReminderCountdownUiTimer() {
        if (reminderCountdownUiTimer) {
            clearInterval(reminderCountdownUiTimer);
        }
        reminderCountdownUiTimer = setInterval(() => {
            updateReminderCountdownDisplays();
        }, 1000);
        updateReminderCountdownDisplays();
    }

    async function renderTasksList() {
        todoListContainer.innerHTML = '';
        taskSnoozeUiRefs = new Map();
        updateProjectAndTagDropdowns();
        updateReminderCountdownDisplays();

        const tasks = getTasks();
        let filteredTasks = tasks;

        if (showingArchive) {
            filteredTasks = tasks.filter(t => t.archived);
        } else {
            filteredTasks = tasks.filter(t => !t.archived);
            if (currentFilter === 'active') {
                filteredTasks = filteredTasks.filter(t => !t.completed);
            } else if (currentFilter === 'completed') {
                filteredTasks = filteredTasks.filter(t => t.completed);
            }
        }

        // Apply Project Filter
        if (currentProjectFilter !== 'all') {
            filteredTasks = filteredTasks.filter(t => t.project === currentProjectFilter);
        }

        // Apply Tag Filter
        if (currentTagFilter !== 'all') {
            filteredTasks = filteredTasks.filter(t => Array.isArray(t.tags) && t.tags.includes(currentTagFilter));
        }

        // Apply Search query
        if (taskSearchQuery) {
            filteredTasks = filteredTasks.filter(t =>
                (t.title && t.title.toLowerCase().includes(taskSearchQuery)) ||
                (t.description && t.description.toLowerCase().includes(taskSearchQuery))
            );
        }

        // Sort: Incomplete first, then based on currentSort variable
        const priorityWeight = { P1: 4, P2: 3, P3: 2, P4: 1, p1: 4, p2: 3, p3: 2, p4: 1 };
        filteredTasks.sort((a, b) => {
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }
            if (currentSort === 'priority') {
                const weightA = priorityWeight[String(a.priority).toUpperCase()] || 1;
                const weightB = priorityWeight[String(b.priority).toUpperCase()] || 1;
                if (weightA !== weightB) return weightB - weightA;
                if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                if (a.dueDate) return -1;
                if (b.dueDate) return 1;
                return b.createdAt - a.createdAt;
            } else if (currentSort === 'dueDate') {
                if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                if (a.dueDate) return -1;
                if (b.dueDate) return 1;
                const weightA = priorityWeight[String(a.priority).toUpperCase()] || 1;
                const weightB = priorityWeight[String(b.priority).toUpperCase()] || 1;
                if (weightA !== weightB) return weightB - weightA;
                return b.createdAt - a.createdAt;
            } else { // created
                return b.createdAt - a.createdAt;
            }
        });

        if (filteredTasks.length === 0) {
            const isFirstTodoView = !showingArchive
                && tasks.length === 0
                && !taskSearchQuery
                && currentProjectFilter === 'all'
                && currentTagFilter === 'all';
            if (isFirstTodoView) {
                todoListContainer.appendChild(createFeatureWelcomeState({
                    title: '📝 Task Manager',
                    description: 'Keep track of your work.',
                    examples: ['Update HC', 'Code TOTs', 'meeting'],
                    features: ['Priority', 'Due date', 'Search', 'Complete history']
                }));
            } else {
                const emptyMsg = document.createElement('div');
                emptyMsg.className = 'bm-todo-empty';
                emptyMsg.textContent = showingArchive ? 'Archive is empty.' : 'No tasks found.';
                todoListContainer.appendChild(emptyMsg);
            }
            return;
        }

        const todayStr = new Date().toISOString().split('T')[0];

        filteredTasks.forEach(task => {
            const item = document.createElement('div');
            item.className = `bm-todo-item prio-${(task.priority || 'P4').toLowerCase()}${task.completed ? ' completed' : ''}`;

            item.addEventListener('click', e => {
                if (e.target.tagName !== 'INPUT'
                    && !e.target.classList.contains('bm-todo-link')
                    && !e.target.classList.contains('bm-todo-delete-btn')
                    && !e.target.classList.contains('bm-todo-archive-btn')
                    && !e.target.classList.contains('bm-todo-subtask-toggle')
                    && !e.target.closest('.bm-todo-subtasks-inline')) {
                    showTaskDetailsModal(task);
                }
            });

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'bm-todo-checkbox';
            checkbox.checked = task.completed;
            checkbox.addEventListener('change', () => {
                if (showingArchive) {
                    updateTask(task.id, { archived: false, completed: false });
                } else {
                    toggleTask(task.id);
                }
                renderTasksList();
            });

            const textWrapper = document.createElement('div');
            textWrapper.className = 'bm-todo-text-wrapper';

            const text = document.createElement('div');
            text.className = 'bm-todo-text';
            text.textContent = task.title;
            textWrapper.appendChild(text);

            const meta = document.createElement('div');
            meta.className = 'bm-todo-meta';

            if (task.project) {
                const projBadge = document.createElement('span');
                projBadge.className = 'bm-todo-project-badge';
                projBadge.textContent = `📁 ${task.project}`;
                meta.appendChild(projBadge);
            }

            if (task.recurrence && task.recurrence !== 'none') {
                const recBadge = document.createElement('span');
                recBadge.className = 'bm-todo-recurrence-badge';
                recBadge.innerHTML = `🔁 ${task.recurrence}`;
                meta.appendChild(recBadge);
            }

            if (task.dueDate) {
                const dueBadge = document.createElement('span');
                dueBadge.className = 'bm-todo-badge due-date';
                const d = new Date(task.dueDate);
                dueBadge.textContent = `📅 ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

                if (!task.completed && task.dueDate < new Date().toISOString()) {
                    dueBadge.classList.add('overdue');
                    dueBadge.textContent = `⚠️ Overdue: ${d.toLocaleDateString()}`;
                }
                meta.appendChild(dueBadge);
            }

            const snoozedAtMs = task.snoozedUntil ? new Date(task.snoozedUntil).getTime() : NaN;
            if (!task.completed && !task.archived && Number.isFinite(snoozedAtMs) && snoozedAtMs >= (Date.now() - 1000)) {
                const snoozeBadge = document.createElement('span');
                snoozeBadge.className = 'bm-todo-snooze-inline';

                const snoozeTime = document.createElement('span');
                snoozeTime.className = 'bm-todo-snooze-time';
                snoozeTime.textContent = formatCountdownClock(Math.max(0, snoozedAtMs - Date.now()));

                const snoozeStopBtn = document.createElement('button');
                snoozeStopBtn.type = 'button';
                snoozeStopBtn.className = 'bm-todo-snooze-stop';
                snoozeStopBtn.textContent = '⏹';
                snoozeStopBtn.title = 'Stop snooze';
                snoozeStopBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const ok = stopSnoozedTaskReminder(task.id);
                    if (!ok) return;
                    renderTasksList();
                    showFlash('Snooze stopped', false, 'success');
                });

                snoozeBadge.appendChild(snoozeTime);
                snoozeBadge.appendChild(snoozeStopBtn);
                taskSnoozeUiRefs.set(task.id, { wrap: snoozeBadge, time: snoozeTime });
                meta.appendChild(snoozeBadge);
            }

            if (Array.isArray(task.tags)) {
                task.tags.forEach(t => {
                    const tagBadge = document.createElement('span');
                    tagBadge.className = 'bm-todo-tag-badge';
                    tagBadge.textContent = `#${t}`;
                    meta.appendChild(tagBadge);
                });
            }



            textWrapper.appendChild(meta);

            if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
                const total = task.subtasks.length;
                const completedCount = task.subtasks.filter(s => s.completed).length;
                const pct = Math.round((completedCount / total) * 100);

                const progressContainer = document.createElement('div');
                progressContainer.className = 'bm-todo-progress-container';
                progressContainer.title = `Subtasks: ${completedCount}/${total} (${pct}%)`;

                const progressBar = document.createElement('div');
                progressBar.className = 'bm-todo-progress-bar';
                progressBar.style.width = `${pct}%`;

                progressContainer.appendChild(progressBar);
                textWrapper.appendChild(progressContainer);

                // --- Always-visible inline subtask list ---
                const subtasksInline = document.createElement('div');
                subtasksInline.className = 'bm-todo-subtasks-inline';

                function renderInlineSubtasks() {
                    subtasksInline.innerHTML = '';
                    const freshTask = getTasks().find(t => t.id === task.id);
                    const subs = freshTask ? freshTask.subtasks : task.subtasks;
                    const doneCount = subs.filter(s => s.completed).length;
                    const pctNow = Math.round((doneCount / subs.length) * 100);
                    progressBar.style.width = `${pctNow}%`;
                    progressContainer.title = `Subtasks: ${doneCount}/${subs.length} (${pctNow}%)`;

                    subs.forEach((sub, idx) => {
                        const row = document.createElement('div');
                        row.className = `bm-todo-subtask-inline-item${sub.completed ? ' done' : ''}`;

                        const cb = document.createElement('input');
                        cb.type = 'checkbox';
                        cb.checked = sub.completed;
                        cb.style.cursor = 'pointer';
                        cb.addEventListener('change', (e) => {
                            e.stopPropagation();
                            const allTasks = getTasks();
                            const t = allTasks.find(x => x.id === task.id);
                            if (t && t.subtasks[idx]) {
                                t.subtasks[idx].completed = cb.checked;
                                saveTasks(allTasks);
                                task.subtasks = t.subtasks;
                                renderInlineSubtasks();
                            }
                        });

                        const label = document.createElement('span');
                        label.textContent = sub.text;
                        label.style.color = sub.completed ? '#999' : '#333';

                        row.appendChild(cb);
                        row.appendChild(label);
                        subtasksInline.appendChild(row);
                    });
                }

                renderInlineSubtasks();
                textWrapper.appendChild(subtasksInline);
            }

            const actionsWrap = document.createElement('div');
            actionsWrap.style.display = 'flex';
            actionsWrap.style.alignItems = 'center';
            actionsWrap.style.gap = '4px';

            const archiveToggleBtn = document.createElement('button');
            archiveToggleBtn.className = 'bm-todo-delete-btn bm-todo-archive-btn';
            archiveToggleBtn.innerHTML = showingArchive ? '↩️' : '📦';
            archiveToggleBtn.title = showingArchive ? 'Restore task' : 'Archive task';
            archiveToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (showingArchive) {
                    updateTask(task.id, { archived: false, completed: false });
                } else {
                    updateTask(task.id, { archived: true });
                }
                renderTasksList();
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'bm-todo-delete-btn';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = showingArchive ? 'Delete permanently' : 'Delete task';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const message = showingArchive
                    ? `Delete task "${task.title}" permanently?`
                    : `Delete task "${task.title}"?`;
                bmConfirm(message, (result) => {
                    if (!result) return;
                    deleteTask(task.id);
                    renderTasksList();
                    showFlash(showingArchive ? 'Task deleted permanently' : 'Task deleted', false, 'success');
                });
            });

            item.appendChild(checkbox);
            item.appendChild(textWrapper);
            actionsWrap.appendChild(archiveToggleBtn);
            actionsWrap.appendChild(deleteBtn);
            item.appendChild(actionsWrap);
            todoListContainer.appendChild(item);
        });
    }

    async function submitNewTask() {
        const text = taskInput.value.trim();
        if (!text) return;

        const nlpResult = parseTaskTextWithNLP(text);
        const title = nlpResult.title;
        const tags = nlpResult.tags;

        let dueDate = dateInput.value ? new Date(dateInput.value).toISOString() : null;
        if (!dueDate && nlpResult.dueDate) {
            dueDate = nlpResult.dueDate;
        }

        const priority = prioritySelect.value;
        const project = projectSelect.value;
        const linkedItem = null;

        let reminderTime = null;
        if (dueDate) {
            reminderTime = dueDate;
        }

        addTask(title, priority, dueDate, linkedItem, project, 'none', '', tags, reminderTime);

        taskInput.value = '';
        prioritySelect.value = 'P4';
        const projects = getTodoProjects();
        if (projects.length > 0) {
            projectSelect.value = projects[0];
        }
        dateInput.value = '';
        nlpPreview.style.setProperty('display', 'none', 'important');

        renderTasksList();
    }

    function createCustomModal(titleText, bodyElement) {
        const modal = document.createElement('div');
        modal.className = 'bm-modal';
        Object.assign(modal.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#ffffff',
            border: '1px solid #c8dbf2',
            borderRadius: '10px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            zIndex: '10010',
            width: '280px',
            padding: '12px',
            boxSizing: 'border-box',
            fontFamily: 'sans-serif',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        });

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.borderBottom = '1px solid #eee';
        header.style.paddingBottom = '4px';

        const title = document.createElement('div');
        title.style.fontWeight = 'bold';
        title.style.fontSize = '14px';
        title.style.color = '#1f4e79';
        title.textContent = titleText;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.background = 'none';
        closeBtn.style.border = 'none';
        closeBtn.style.fontSize = '20px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.color = '#888';
        closeBtn.addEventListener('click', () => modal.remove());

        header.appendChild(title);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        const content = document.createElement('div');
        content.className = 'bm-modal-scroll';
        Object.assign(content.style, {
            flex: '1',
            overflowY: 'auto',
            maxHeight: 'calc(80vh - 80px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingRight: '2px'
        });
        content.appendChild(bodyElement);
        modal.appendChild(content);

        panel.appendChild(modal);
        return modal;
    }

    function showInsightsModal() {
        if (panel.querySelector('.bm-modal')) return;
        const tasks = getTasks();
        const total = tasks.length;
        const completed = tasks.filter(t => t.completed).length;
        const active = tasks.filter(t => !t.completed && !t.archived).length;
        const archived = tasks.filter(t => t.archived).length;
        const overdue = tasks.filter(t => !t.completed && !t.archived && t.dueDate && t.dueDate < new Date().toISOString()).length;
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

        const body = document.createElement('div');
        body.className = 'bm-todo-insights';
        body.innerHTML = `
            <div class="bm-todo-insights-grid">
                <div class="bm-todo-insights-card">
                    <div class="bm-todo-insights-val">${active}</div>
                    <div class="bm-todo-insights-lbl">Active</div>
                </div>
                <div class="bm-todo-insights-card" style="border-color: #ffcdd2 !important;">
                    <div class="bm-todo-insights-val" style="color: #d32f2f !important;">${overdue}</div>
                    <div class="bm-todo-insights-lbl">Overdue</div>
                </div>
                <div class="bm-todo-insights-card">
                    <div class="bm-todo-insights-val">${completed}</div>
                    <div class="bm-todo-insights-lbl">Done</div>
                </div>
                <div class="bm-todo-insights-card">
                    <div class="bm-todo-insights-val">${archived}</div>
                    <div class="bm-todo-insights-lbl">Archived</div>
                </div>
            </div>
            <div class="bm-todo-insights-card" style="width: 100%;">
                <div class="bm-todo-insights-val">${rate}%</div>
                <div class="bm-todo-insights-lbl">Completion Rate</div>
                <div class="bm-todo-progress-container" style="margin-top: 6px !important;">
                    <div class="bm-todo-progress-bar" style="width: ${rate}%;"></div>
                </div>
            </div>
        `;

        createCustomModal('📊 Productivity Insights', body);
    }

    function showTaskDetailsModal(task) {
        if (panel.querySelector('.bm-modal')) return;
        const body = document.createElement('div');
        body.className = 'bm-todo-edit-modal-body';

        const groupTitle = document.createElement('div');
        groupTitle.className = 'bm-todo-field-group';
        const labelTitle = document.createElement('div');
        labelTitle.className = 'bm-todo-field-label';
        labelTitle.textContent = 'Title';
        const inputTitle = document.createElement('input');
        inputTitle.type = 'text';
        inputTitle.className = 'bm-todo-field-input';
        inputTitle.value = task.title;
        groupTitle.appendChild(labelTitle);
        groupTitle.appendChild(inputTitle);
        body.appendChild(groupTitle);

        const groupDesc = document.createElement('div');
        groupDesc.className = 'bm-todo-field-group';
        const labelDesc = document.createElement('div');
        labelDesc.className = 'bm-todo-field-label';
        labelDesc.textContent = 'Description / Notes';
        const inputDesc = document.createElement('textarea');
        inputDesc.className = 'bm-todo-field-input';
        inputDesc.style.height = '60px';
        inputDesc.style.resize = 'vertical';
        inputDesc.value = task.description || '';
        groupDesc.appendChild(labelDesc);
        groupDesc.appendChild(inputDesc);
        body.appendChild(groupDesc);

        const row1 = document.createElement('div');
        row1.style.display = 'flex';
        row1.style.gap = '6px';

        const groupProj = document.createElement('div');
        groupProj.className = 'bm-todo-field-group';
        groupProj.style.flex = '1';
        const labelProj = document.createElement('div');
        labelProj.className = 'bm-todo-field-label';
        labelProj.textContent = 'Project';
        const selectProj = document.createElement('select');
        selectProj.className = 'bm-todo-field-input';
        const projectsListModal = getTodoProjects();
        projectsListModal.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            selectProj.appendChild(opt);
        });
        selectProj.value = task.project || (projectsListModal[0] || 'Personal');
        groupProj.appendChild(labelProj);
        groupProj.appendChild(selectProj);
        row1.appendChild(groupProj);

        const groupPrio = document.createElement('div');
        groupPrio.className = 'bm-todo-field-group';
        groupPrio.style.flex = '1';
        const labelPrio = document.createElement('div');
        labelPrio.className = 'bm-todo-field-label';
        labelPrio.textContent = 'Priority';
        const selectPrio = document.createElement('select');
        selectPrio.className = 'bm-todo-field-input';
        selectPrio.innerHTML = `
            <option value="P1">🔴 P1</option>
            <option value="P2">🟡 P2</option>
            <option value="P3">🟢 P3</option>
            <option value="P4">⚪ P4</option>
        `;
        selectPrio.value = task.priority || 'P4';
        groupPrio.appendChild(labelPrio);
        groupPrio.appendChild(selectPrio);
        row1.appendChild(groupPrio);
        body.appendChild(row1);

        const row2 = document.createElement('div');
        row2.style.display = 'flex';
        row2.style.flexDirection = 'column';
        row2.style.gap = '8px';

        const groupDate = document.createElement('div');
        groupDate.className = 'bm-todo-field-group';
        groupDate.style.flex = '1';
        groupDate.style.minWidth = '0';
        const labelDate = document.createElement('div');
        labelDate.className = 'bm-todo-field-label';
        labelDate.textContent = 'Due Date & Time';

        const dateTimeInputs = document.createElement('div');
        dateTimeInputs.style.display = 'flex';
        dateTimeInputs.style.alignItems = 'center';
        dateTimeInputs.style.gap = '6px';
        dateTimeInputs.style.width = '100%';
        dateTimeInputs.style.boxSizing = 'border-box';

        const inputDateOnly = document.createElement('input');
        inputDateOnly.type = 'date';
        inputDateOnly.className = 'bm-todo-field-input';
        inputDateOnly.style.flex = '1 1 auto';
        inputDateOnly.style.minWidth = '0';
        inputDateOnly.style.setProperty('width', 'auto', 'important');

        const inputTimeOnly = document.createElement('input');
        inputTimeOnly.type = 'time';
        inputTimeOnly.className = 'bm-todo-field-input';
        inputTimeOnly.style.flex = '1 1 auto';
        inputTimeOnly.style.setProperty('width', '100%', 'important');
        inputTimeOnly.step = '60';
        const isFirefox = /firefox/i.test((navigator && navigator.userAgent) || '');
        const needsCustomTimePicker = isFirefox;
        const timePickerWrap = document.createElement('div');
        timePickerWrap.className = 'bm-todo-time-picker-wrap';

        const timePickerBtn = document.createElement('button');
        timePickerBtn.type = 'button';
        timePickerBtn.className = 'bm-todo-time-picker-btn';
        timePickerBtn.textContent = '🕒';
        timePickerBtn.title = 'Choose time';

        const timePickerPopup = document.createElement('div');
        timePickerPopup.className = 'bm-todo-time-picker-popup';
        timePickerPopup.style.display = 'none';

        const timePickerGrid = document.createElement('div');
        timePickerGrid.className = 'bm-todo-time-picker-grid';
        timePickerPopup.appendChild(timePickerGrid);

        let modal = null;
        let removeTimePickerOutsideHandler = null;
        let selectedHour12 = '09';
        let selectedMinute = '00';
        let selectedMeridiem = 'AM';

        const createTimePickerColumn = (titleText) => {
            const col = document.createElement('div');
            col.className = 'bm-todo-time-picker-col';
            const title = document.createElement('div');
            title.className = 'bm-todo-time-picker-col-title';
            title.textContent = titleText;
            const list = document.createElement('div');
            list.className = 'bm-todo-time-picker-list';
            col.appendChild(title);
            col.appendChild(list);
            timePickerGrid.appendChild(col);
            return list;
        };

        const hourList = createTimePickerColumn('Hour');
        const minuteList = createTimePickerColumn('Min');
        const meridiemList = createTimePickerColumn('AM/PM');

        const setTimeValue = (value) => {
            inputTimeOnly.value = value;
            inputTimeOnly.dispatchEvent(new Event('input', { bubbles: true }));
            inputTimeOnly.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const getTimePickerStateFromInput = () => {
            const now = new Date();
            const fallbackRaw = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const raw = inputTimeOnly.value || fallbackRaw;
            const parts = raw.split(':');
            const hour24 = Math.max(0, Math.min(23, parseInt(parts[0], 10) || now.getHours()));
            const minute = Math.max(0, Math.min(59, parseInt(parts[1], 10) || now.getMinutes()));
            selectedMeridiem = hour24 >= 12 ? 'PM' : 'AM';
            const normalizedHour = hour24 % 12 || 12;
            selectedHour12 = String(normalizedHour).padStart(2, '0');
            selectedMinute = String(minute).padStart(2, '0');
        };
        const syncInputFromPickerState = () => {
            let hour24 = parseInt(selectedHour12, 10) % 12;
            if (selectedMeridiem === 'PM') hour24 += 12;
            const value = `${String(hour24).padStart(2, '0')}:${selectedMinute}`;
            setTimeValue(value);
        };
        const scrollActiveTimePickerItemIntoView = (list, activeSelector) => {
            const activeEl = list.querySelector(activeSelector);
            if (activeEl) {
                const nextTop = Math.max(0, activeEl.offsetTop - 2);
                list.scrollTop = nextTop;
            }
        };
        const renderTimePickerOptions = () => {
            // Factory functions defined outside the loops to satisfy ESLint no-loop-func.
            const onHourClick = (v) => (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                selectedHour12 = v;
                syncInputFromPickerState();
                renderTimePickerOptions();
            };
            const onMinuteClick = (v) => (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                selectedMinute = v;
                syncInputFromPickerState();
                renderTimePickerOptions();
            };

            hourList.innerHTML = '';
            minuteList.innerHTML = '';
            meridiemList.innerHTML = '';

            for (let hour = 1; hour <= 12; hour++) {
                const value = String(hour).padStart(2, '0');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `bm-todo-time-picker-item${selectedHour12 === value ? ' active' : ''}`;
                btn.textContent = value;
                btn.addEventListener('click', onHourClick(value));
                hourList.appendChild(btn);
            }

            for (let minute = 0; minute < 60; minute++) {
                const value = String(minute).padStart(2, '0');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `bm-todo-time-picker-item${selectedMinute === value ? ' active' : ''}`;
                btn.textContent = value;
                btn.addEventListener('click', onMinuteClick(value));
                minuteList.appendChild(btn);
            }

            ['AM', 'PM'].forEach((value) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `bm-todo-time-picker-item${selectedMeridiem === value ? ' active' : ''}`;
                btn.textContent = value;
                btn.addEventListener('click', (evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                    selectedMeridiem = value;
                    syncInputFromPickerState();
                    renderTimePickerOptions();
                });
                meridiemList.appendChild(btn);
            });

            requestAnimationFrame(() => {
                scrollActiveTimePickerItemIntoView(hourList, '.bm-todo-time-picker-item.active');
                scrollActiveTimePickerItemIntoView(minuteList, '.bm-todo-time-picker-item.active');
                scrollActiveTimePickerItemIntoView(meridiemList, '.bm-todo-time-picker-item.active');
            });
        };

        const positionTimePickerPopup = () => {
            if (!modal) return;
            const modalRect = modal.getBoundingClientRect();
            const btnRect = timePickerBtn.getBoundingClientRect();
            const popupWidth = 190;
            const popupHeight = 246;
            const top = Math.max(44, Math.min(btnRect.bottom - modalRect.top + 4, modal.clientHeight - popupHeight - 8));
            const left = Math.max(8, Math.min(btnRect.right - modalRect.left - popupWidth, modal.clientWidth - popupWidth - 8));
            timePickerPopup.style.top = `${top}px`;
            timePickerPopup.style.left = `${left}px`;
        };
        const closeTimePickerPopup = () => {
            timePickerPopup.style.display = 'none';
            if (removeTimePickerOutsideHandler) {
                document.removeEventListener('click', removeTimePickerOutsideHandler, true);
                document.removeEventListener('scroll', positionTimePickerPopup, true);
                window.removeEventListener('resize', positionTimePickerPopup);
                removeTimePickerOutsideHandler = null;
            }
        };
        const openTimePickerPopup = () => {
            if (!needsCustomTimePicker || !modal) return;
            getTimePickerStateFromInput();
            renderTimePickerOptions();
            positionTimePickerPopup();
            timePickerPopup.style.display = 'block';
            if (!removeTimePickerOutsideHandler) {
                removeTimePickerOutsideHandler = (evt) => {
                    if (!timePickerWrap.contains(evt.target) && !timePickerPopup.contains(evt.target)) {
                        closeTimePickerPopup();
                    }
                };
                document.addEventListener('click', removeTimePickerOutsideHandler, true);
                document.addEventListener('scroll', positionTimePickerPopup, true);
                window.addEventListener('resize', positionTimePickerPopup);
            }
        };

        timePickerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (timePickerPopup.style.display === 'block') {
                closeTimePickerPopup();
            } else {
                openTimePickerPopup();
            }
        });

        timePickerWrap.appendChild(inputTimeOnly);
        if (needsCustomTimePicker) {
            timePickerWrap.appendChild(timePickerBtn);
        } else {
            timePickerWrap.style.flex = '0 0 96px';
            timePickerWrap.style.width = '96px';
            timePickerWrap.style.minWidth = '96px';
        }

        if (task.dueDate) {
            const local = new Date(task.dueDate);
            const offsetMs = local.getTimezoneOffset() * 60000;
            const isoLocal = new Date(local.getTime() - offsetMs).toISOString().slice(0, 16);
            inputDateOnly.value = isoLocal.slice(0, 10);
            inputTimeOnly.value = isoLocal.slice(11, 16);
        }
        dateTimeInputs.appendChild(inputDateOnly);
        if (needsCustomTimePicker) {
            dateTimeInputs.appendChild(timePickerWrap);
        } else {
            timePickerWrap.appendChild(inputTimeOnly);
            dateTimeInputs.appendChild(timePickerWrap);
        }
        groupDate.appendChild(labelDate);
        groupDate.appendChild(dateTimeInputs);
        row2.appendChild(groupDate);

        const groupRecur = document.createElement('div');
        groupRecur.className = 'bm-todo-field-group';
        groupRecur.style.flex = '1';
        groupRecur.style.minWidth = '0';
        const labelRecur = document.createElement('div');
        labelRecur.className = 'bm-todo-field-label';
        labelRecur.textContent = 'Repeat';
        const selectRecur = document.createElement('select');
        selectRecur.className = 'bm-todo-field-input';
        selectRecur.style.setProperty('width', '100%', 'important');
        selectRecur.innerHTML = `
            <option value="none">None</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
        `;
        selectRecur.value = task.recurrence || 'none';
        groupRecur.appendChild(labelRecur);
        groupRecur.appendChild(selectRecur);
        row2.appendChild(groupRecur);
        body.appendChild(row2);

        const groupReminder = document.createElement('div');
        groupReminder.className = 'bm-todo-field-group';
        const labelReminder = document.createElement('div');
        labelReminder.className = 'bm-todo-field-label';
        labelReminder.textContent = 'Reminder Offset';
        const selectReminder = document.createElement('select');
        selectReminder.className = 'bm-todo-field-input';
        selectReminder.innerHTML = `
            <option value="none">None</option>
            <option value="0">At due time</option>
            <option value="600000">10 mins before</option>
            <option value="1800000">30 mins before</option>
            <option value="3600000">1 hour before</option>
            <option value="86400000">1 day before</option>
        `;
        if (task.reminderTime && task.dueDate) {
            const diff = new Date(task.dueDate).getTime() - new Date(task.reminderTime).getTime();
            const options = ['0', '600000', '1800000', '3600000', '86400000'];
            let closest = '0';
            let minDiff = Infinity;
            options.forEach(opt => {
                const d = Math.abs(parseInt(opt) - diff);
                if (d < minDiff) {
                    minDiff = d;
                    closest = opt;
                }
            });
            selectReminder.value = closest;
        } else {
            selectReminder.value = 'none';
        }
        groupReminder.appendChild(labelReminder);
        groupReminder.appendChild(selectReminder);
        body.appendChild(groupReminder);

        const groupTags = document.createElement('div');
        groupTags.className = 'bm-todo-field-group';
        const labelTags = document.createElement('div');
        labelTags.className = 'bm-todo-field-label';
        labelTags.textContent = 'Tags (comma separated)';
        const inputTags = document.createElement('input');
        inputTags.type = 'text';
        inputTags.className = 'bm-todo-field-input';
        inputTags.value = Array.isArray(task.tags) ? task.tags.join(', ') : '';
        groupTags.appendChild(labelTags);
        groupTags.appendChild(inputTags);
        body.appendChild(groupTags);

        const groupSubtasks = document.createElement('div');
        groupSubtasks.className = 'bm-todo-field-group';
        const labelSubtasks = document.createElement('div');
        labelSubtasks.className = 'bm-todo-field-label';
        labelSubtasks.textContent = 'Subtasks';
        groupSubtasks.appendChild(labelSubtasks);

        const subtasksContainer = document.createElement('div');
        subtasksContainer.className = 'bm-todo-subtasks-container';

        const renderModalSubtasks = () => {
            subtasksContainer.innerHTML = '';
            if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
                task.subtasks.forEach((s, idx) => {
                    const row = document.createElement('div');
                    row.className = `bm-todo-subtask-item${s.completed ? ' completed' : ''}`;

                    const check = document.createElement('input');
                    check.type = 'checkbox';
                    check.checked = s.completed;
                    check.addEventListener('change', () => {
                        s.completed = check.checked;
                        updateTask(task.id, { subtasks: task.subtasks });
                        renderModalSubtasks();
                        renderTasksList();
                    });

                    const span = document.createElement('span');
                    span.className = 'bm-todo-subtask-text';
                    span.textContent = s.text;
                    span.style.cursor = 'pointer';
                    span.title = 'Double-click to edit';
                    span.addEventListener('dblclick', () => {
                        const editInput = document.createElement('input');
                        editInput.type = 'text';
                        editInput.value = s.text;
                        editInput.className = 'bm-todo-field-input';
                        editInput.style.fontSize = '12px';
                        editInput.style.padding = '2px 4px';
                        editInput.style.flex = '1';
                        span.replaceWith(editInput);
                        editInput.focus();
                        editInput.select();

                        const saveEdit = () => {
                            const newText = editInput.value.trim();
                            if (newText && newText !== s.text) {
                                s.text = newText;
                                updateTask(task.id, { subtasks: task.subtasks });
                                renderTasksList();
                            }
                            renderModalSubtasks();
                        };

                        editInput.addEventListener('blur', saveEdit);
                        editInput.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
                            if (e.key === 'Escape') { renderModalSubtasks(); }
                        });
                    });

                    const del = document.createElement('button');
                    del.className = 'bm-todo-delete-btn';
                    del.innerHTML = '&times;';
                    del.addEventListener('click', () => {
                        task.subtasks = task.subtasks.filter(x => x.id !== s.id);
                        updateTask(task.id, { subtasks: task.subtasks });
                        renderModalSubtasks();
                        renderTasksList();
                    });

                    row.appendChild(check);
                    row.appendChild(span);
                    row.appendChild(del);
                    subtasksContainer.appendChild(row);
                });
            } else {
                subtasksContainer.innerHTML = '<div class="bm-todo-subtasks-empty">No subtasks.</div>';
            }
        };

        const addSubtaskRow = document.createElement('div');
        addSubtaskRow.style.display = 'flex';
        addSubtaskRow.style.gap = '4px';
        addSubtaskRow.style.marginTop = '4px';

        const subtaskIn = document.createElement('input');
        subtaskIn.type = 'text';
        subtaskIn.placeholder = 'Add subtask...';
        subtaskIn.className = 'bm-todo-field-input';
        subtaskIn.style.flex = '1';

        const subtaskAdd = document.createElement('button');
        subtaskAdd.className = 'bm-todo-add-btn';
        subtaskAdd.textContent = '➕';
        subtaskAdd.addEventListener('click', () => {
            const txt = subtaskIn.value.trim();
            if (!txt) return;
            if (!Array.isArray(task.subtasks)) task.subtasks = [];
            task.subtasks.push({
                id: Date.now() + Math.floor(Math.random() * 100),
                text: txt,
                completed: false
            });
            updateTask(task.id, { subtasks: task.subtasks });
            subtaskIn.value = '';
            renderModalSubtasks();
            renderTasksList();
        });

        addSubtaskRow.appendChild(subtaskIn);
        addSubtaskRow.appendChild(subtaskAdd);

        groupSubtasks.appendChild(subtasksContainer);
        groupSubtasks.appendChild(addSubtaskRow);
        body.appendChild(groupSubtasks);

        const actionRow = document.createElement('div');
        actionRow.className = 'bm-modal-actions bm-todo-edit-actions';
        actionRow.style.marginTop = '12px';
        actionRow.style.justifyContent = 'center';

        const styleIconModalButton = (button) => {
            button.style.background = 'transparent';
            button.style.border = 'none';
            button.style.boxShadow = 'none';
            button.style.borderRadius = '0';
            button.style.padding = '2px 4px';
            button.style.minWidth = '0';
            button.style.fontSize = '20px';
            button.style.lineHeight = '1';
            button.style.cursor = 'pointer';
        };

        const saveBtn = document.createElement('button');
        saveBtn.className = 'bm-modal-action-btn';
        saveBtn.textContent = '💾';
        saveBtn.title = 'Save Changes';
        styleIconModalButton(saveBtn);
        saveBtn.addEventListener('click', () => {
            const titleVal = inputTitle.value.trim();
            if (!titleVal) return;

            closeTimePickerPopup();

            const descVal = inputDesc.value.trim();
            const projVal = selectProj.value;
            const prioVal = selectPrio.value;
            const recurVal = selectRecur.value;

            let dueVal = composeTaskDueDate(inputDateOnly.value, inputTimeOnly.value, { defaultTime: '09:00', useTodayForTimeOnly: true });

            let reminderVal = null;
            if (dueVal && selectReminder.value !== 'none') {
                const offset = parseInt(selectReminder.value);
                reminderVal = new Date(new Date(dueVal).getTime() - offset).toISOString();
            }

            const tagsVal = inputTags.value.split(',')
                .map(t => t.trim().toLowerCase())
                .filter(t => t.length > 0);

            updateTask(task.id, {
                title: titleVal,
                description: descVal,
                project: projVal,
                priority: prioVal,
                dueDate: dueVal,
                recurrence: recurVal,
                reminderTime: reminderVal,
                snoozedUntil: null,
                reminderSent: (task.reminderTime !== reminderVal) ? false : task.reminderSent,
                tags: tagsVal
            });

            modal.remove();
            renderTasksList();
            showFlash('Task updated', false, 'success');
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-modal-action-btn';
        cancelBtn.textContent = '✖';
        cancelBtn.title = 'Close';
        styleIconModalButton(cancelBtn);
        cancelBtn.addEventListener('click', () => {
            closeTimePickerPopup();
            modal.remove();
        });

        if (!task.completed && !task.archived && (task.reminderTime || task.dueDate)) {
            const snoozeBtn = document.createElement('button');
            snoozeBtn.className = 'bm-modal-action-btn';
            snoozeBtn.textContent = '⏰';
            snoozeBtn.title = 'Snooze reminder 10 minutes';
            styleIconModalButton(snoozeBtn);
            snoozeBtn.addEventListener('click', () => {
                const ok = snoozeTaskReminder(task.id, 10);
                if (!ok) return;
                modal.remove();
                renderTasksList();
                showFlash('Reminder snoozed for 10 minutes', false, 'success');
            });
            actionRow.appendChild(snoozeBtn);
        }

        actionRow.appendChild(saveBtn);
        actionRow.appendChild(cancelBtn);
        body.appendChild(actionRow);

        modal = createCustomModal('📋 Edit Task Details', body);
        modal.style.width = '294px';
        modal.style.overflow = 'visible';
        modal.dataset.noAutoclose = '1';
        modal.tabIndex = -1;

        if (needsCustomTimePicker) {
            modal.appendChild(timePickerPopup);
        }

        modal.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            closeTimePickerPopup();
            modal.remove();
        });

        requestAnimationFrame(() => {
            try {
                inputTitle.focus({ preventScroll: true });
                inputTitle.select();
            } catch {
                modal.focus();
            }
        });

        renderModalSubtasks();
    }

    addBtn.addEventListener('click', submitNewTask);
    taskInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            submitNewTask();
        }
    });

    renderTasksList();
    updateTaskTabBadge();
    startReminderCountdownUiTimer();

    let dropdownOpen = false;

    let openFolderMenu = null;
    let openFolderMenuElement = null;
    let activeFolder = null;
    let activeSubFolder = null;
    let selectedBarcodeIds = new Set();
    let renderSeq = 0;

    function closeOpenFolderMenu() {
        if (openFolderMenuElement) {
            openFolderMenuElement.remove();
            openFolderMenuElement = null;
            openFolderMenu = null;
        }
    }

    function toggleDropdown(e) {
        closeOpenFolderMenu();
        closeSearchUI();
        formWrapper.innerHTML = '';
        if (!dropdownOpen) {
            dropdown.style.position = 'absolute';
            dropdown.style.left = menuButton.offsetLeft + 'px';
            dropdown.style.top = (menuButton.offsetTop + menuButton.offsetHeight) + 'px';
        }
        dropdown.style.display = dropdownOpen ? 'none' : 'flex';
        dropdownOpen = !dropdownOpen;
        if (dropdownOpen) {
            document.addEventListener('click', closeDropdownOnOutsideClick);
        } else {
            document.removeEventListener('click', closeDropdownOnOutsideClick);
        }
    }

    function closeDropdown() {
        dropdown.style.display = 'none';
        dropdownOpen = false;
        document.removeEventListener('click', closeDropdownOnOutsideClick);
    }

    function closeDropdownOnOutsideClick(event) {
        if (dropdownOpen && !dropdown.contains(event.target) && event.target !== menuButton) {
            closeDropdown();
        }
        if (openFolderMenuElement && !openFolderMenuElement.contains(event.target)) {
            closeOpenFolderMenu();
        }
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (isAnyBmModalOpen()) {
                return;
            }
            if (dropdownOpen) {
                closeDropdown();
            }
            if (panel.style.display !== 'none') {
                panel.style.display = 'none';
                clearPanelAutoClose();
            }
            document.querySelectorAll('.bm-folder-menu-open, .bm-barcode-menu-open').forEach(el => {
                el.parentNode && el.parentNode.removeChild(el);
            });
        }
    });

    document.addEventListener('keydown', (e) => {
        if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        const key = String(e.key || '').toLowerCase();
        if (key !== 'c') return;
        const selected = getSelectedTextFromDocument();
        if (!selected) {
            showFlash('Select text first', true, 'error');
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        showBigBarcodeModal(selected, 'CODE128', '', { fromShortcut: true, suppressLabel: true });
    });
    menuButton.addEventListener('click', toggleDropdown);

    // ============================================================
    // SECTION: UI Forms - Folder and Barcode Editing
    // ------------------------------------------------------------
    // These forms mutate storage through the data-operation helpers
    // above, then restore the panel list view.
    // ============================================================

    function showFolderForm() {
        closeOpenFolderMenu();
        // Hide folderDisplay, show formWrapper
        folderDisplay.style.display = 'none';
        formWrapper.style.display = 'flex';
        // Hide footerLeft (item count) during folder creation
        footerLeft.style.visibility = 'hidden';

        const form = document.createElement('div');
        Object.assign(form.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
        });

        const input = document.createElement('input');
        input.placeholder = 'Folder Name';
        input.className = 'bm-input';

        const btnContainer = document.createElement('div');
        Object.assign(btnContainer.style, {
            display: 'flex',
            gap: '8px',
            marginTop: '10px',
        });

        const createBtn = document.createElement('button');
        createBtn.textContent = 'Create';
        createBtn.className = 'bm-button';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'bm-button';

        btnContainer.appendChild(createBtn);
        btnContainer.appendChild(cancelBtn);
        form.appendChild(input);
        form.appendChild(btnContainer);

        formWrapper.innerHTML = '';
        formWrapper.appendChild(form);

        function restoreDisplayAndLayout() {
            formWrapper.innerHTML = '';
            formWrapper.style.display = 'none'; // hide formWrapper after done
            folderDisplay.style.display = 'flex';
            folderDisplay.style.flexWrap = 'wrap';
            folderDisplay.style.flexDirection = 'row';
            // Restore footerLeft visibility
            footerLeft.style.visibility = '';
        }

        createBtn.addEventListener('click', () => {
            const folderName = input.value.trim();
            if (folderName) {
                saveFolder(folderName).then(() => {
                    restoreDisplayAndLayout();
                });
            } else {
                showFlash('Folder name cannot be empty', true, 'error');
            }
        });

        cancelBtn.addEventListener('click', () => {
            restoreDisplayAndLayout();
        });

        input.focus();

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                createBtn.click();
            } else if (e.key === 'Escape') {
                cancelBtn.click();
            }
        });
    }
    function validateBarcodeValue(format, value) {
        switch (format) {
            case 'TEXT':
                return value.length > 0;
            case 'EAN13':
                return /^\d{12,13}$/.test(value);
            case 'EAN8':
                return /^\d{7,8}$/.test(value);
            case 'UPC':
                return /^\d{12}$/.test(value);
            case 'ITF':
                return /^\d+$/.test(value);
            case 'CODE39':
                return /^[A-Z0-9\-\.\ $\/\+\%]+$/.test(value);
            case 'CODABAR':
                return /^[A-D][0-9\-\$:\/\.\+]+[A-D]$/.test(value);
            case 'MSI':
                return /^\d+$/.test(value);
            case 'Pharmacode':
                return /^\d+$/.test(value);
            case 'ISBN':
                return /^(97(8|9))?\d{9}(\d|X)$/.test(value.replace(/-/g, ''));
            case 'B00':
            case 'LPN':
            case 'X00':
                return /^[A-Z0-9]{8,20}$/i.test(value);
            case '2D':
                return value.length > 0;
            case 'QR':
                return value.length > 0;
            case 'CODE128':
            default:
                return value.length > 0;
        }
    }

    function showFolderChangeFormatModal(folderName, subFolderName = null) {
        const existing = document.getElementById('bm-folder-format-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'bm-folder-format-modal';
        modal.className = 'bm-modal';
        modal.dataset.noAutoclose = '1';
        Object.assign(modal.style, {
            padding: '12px',
            minWidth: '240px',
            zIndex: '10002'
        });

        const header = document.createElement('div');
        header.className = 'bm-header';
        header.textContent = `Change Format (${subFolderName ? `${folderName} / ${subFolderName}` : folderName})`;
        header.style.fontSize = '13px';
        header.style.marginBottom = '6px';

        const formatSelect = document.createElement('select');
        formatSelect.className = 'bm-input';
        formatSelect.style.marginBottom = '6px';

        const formats = ['CODE128', 'QR', 'EAN13', 'EAN8', 'UPC', 'ISBN', 'ITF', 'CODABAR', 'TEXT'];
        formats.forEach(fmt => {
            const opt = document.createElement('option');
            opt.value = fmt;
            opt.textContent = fmt;
            formatSelect.appendChild(opt);
        });

        const btnRow = document.createElement('div');
        Object.assign(btnRow.style, {
            display: 'flex',
            gap: '8px',
            justifyContent: 'center'
        });

        const applyBtn = document.createElement('button');
        applyBtn.className = 'bm-button';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('click', async () => {
            const targetFormat = formatSelect.value;
            await updateFolderBarcodesFormat(folderName, targetFormat, subFolderName);
            modal.remove();
            await renderFolders();
            showFlash('Folder formats updated', false, 'success');
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => modal.remove());

        btnRow.append(applyBtn, cancelBtn);
        modal.append(header, formatSelect, btnRow);
        panel.appendChild(modal);
        wireModalIdleTracking(modal);

        modal.tabIndex = -1;
        modal.focus();
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                modal.remove();
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                applyBtn.click();
            }
        });
    }

    // Move a folder or sub-folder (and its contents) to Root or another folder.
    // itemType: 'folder' | 'subfolder'. currentParent only used for sub-folders.
    async function showMoveModal(itemType, itemName, currentParent) {
        const existing = document.getElementById('bm-move-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'bm-move-modal';
        modal.className = 'bm-modal';
        modal.dataset.noAutoclose = '1';
        Object.assign(modal.style, {
            padding: '12px',
            minWidth: '240px',
            zIndex: '10002'
        });

        const header = document.createElement('div');
        header.className = 'bm-header';
        header.textContent = `Move ${itemType === 'folder' ? 'Folder' : 'Sub-folder'} (${itemName})`;
        header.style.fontSize = '13px';
        header.style.marginBottom = '6px';

        const destSelect = document.createElement('select');
        destSelect.className = 'bm-input';
        destSelect.style.marginBottom = '6px';

        const rootOpt = document.createElement('option');
        rootOpt.value = '__ROOT__';
        rootOpt.textContent = '\uD83D\uDCC1 Root';
        destSelect.appendChild(rootOpt);

        const folders = await getFolders();
        folders.forEach(f => {
            if (itemType === 'folder' && f.name === itemName) return; // can't move into itself
            const opt = document.createElement('option');
            opt.value = f.name;
            opt.textContent = `\uD83D\uDCC1 ${f.name}`;
            destSelect.appendChild(opt);
        });

        if (itemType === 'subfolder') {
            destSelect.value = '__ROOT__';
        } else if (destSelect.options.length > 1) {
            destSelect.value = destSelect.options[1].value;
        }

        const btnRow = document.createElement('div');
        Object.assign(btnRow.style, {
            display: 'flex',
            gap: '8px',
            justifyContent: 'center'
        });

        const applyBtn = document.createElement('button');
        applyBtn.className = 'bm-button';
        applyBtn.textContent = 'Move';
        applyBtn.addEventListener('click', async () => {
            const raw = destSelect.value;
            const dest = raw === '__ROOT__' ? '' : raw;
            modal.remove();
            if (itemType === 'folder') {
                await moveFolderTo(itemName, dest);
            } else {
                await moveSubFolderTo(currentParent, itemName, dest);
            }
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => modal.remove());

        btnRow.append(applyBtn, cancelBtn);
        modal.append(header, destSelect, btnRow);
        panel.appendChild(modal);
        wireModalIdleTracking(modal);

        modal.tabIndex = -1;
        modal.focus();
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                modal.remove();
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                applyBtn.click();
            }
        });
    }

    // Move a batch of selected barcodes to a chosen folder / sub-folder.
    async function showMoveBarcodesModal(ids, onDone) {
        const existing = document.getElementById('bm-move-barcodes-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'bm-move-barcodes-modal';
        modal.className = 'bm-modal';
        modal.dataset.noAutoclose = '1';
        Object.assign(modal.style, {
            padding: '12px',
            minWidth: '240px',
            zIndex: '10002'
        });

        const header = document.createElement('div');
        header.className = 'bm-header';
        header.textContent = `Move ${ids.length} barcode(s) to`;
        header.style.fontSize = '13px';
        header.style.marginBottom = '6px';

        const treeSelect = document.createElement('select');
        treeSelect.className = 'bm-input';
        treeSelect.style.marginBottom = '6px';
        await populateFolderTreeSelect(treeSelect, activeFolder || 'Default', activeSubFolder || '');

        const btnRow = document.createElement('div');
        Object.assign(btnRow.style, {
            display: 'flex',
            gap: '8px',
            justifyContent: 'center'
        });

        const applyBtn = document.createElement('button');
        applyBtn.className = 'bm-button';
        applyBtn.textContent = 'Move';
        applyBtn.addEventListener('click', async () => {
            if (treeSelect.value === '__NEW__') {
                showFlash('Choose a destination folder', true, 'error');
                return;
            }
            const { folder, subfolder } = parseTreeSelectValue(treeSelect.value, 'Default');
            modal.remove();
            await moveBarcodesToFolder(ids, folder, subfolder);
            if (typeof onDone === 'function') onDone(folder, subfolder);
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => modal.remove());

        btnRow.append(applyBtn, cancelBtn);
        modal.append(header, treeSelect, btnRow);
        panel.appendChild(modal);
        wireModalIdleTracking(modal);

        modal.tabIndex = -1;
        modal.focus();
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                modal.remove();
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                applyBtn.click();
            }
        });
    }


    function showBarcodeForm(barcodeToEdit = null) {
        closeOpenFolderMenu();
        formWrapper.innerHTML = '';
        // Hide folderDisplay, show formWrapper
        folderDisplay.style.display = 'none';
        formWrapper.style.display = 'flex';
        formWrapper.style.flex = '1 1 auto';
        formWrapper.style.overflow = 'auto';
        // Hide footerLeft (item count) during barcode creation/edit
        footerLeft.style.visibility = 'hidden';

        // --- Dynamically adjust panel height for barcode form ---
        const prevPanelHeight = panel.style.height;
        panel.style.height = 'auto';

        const barcodeFormats = [
            { value: 'CODE128', label: 'CODE128' },
            { value: 'QR', label: 'QR Code' },
            { value: 'EAN13', label: 'EAN13' },
            { value: 'EAN8', label: 'EAN8' },
            { value: 'UPC', label: 'UPC' },
            { value: 'ISBN', label: 'ISBN' },
        ];

        const form = document.createElement('div');
        Object.assign(form.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
        });

        const nameInput = document.createElement('input');
        nameInput.placeholder = 'Barcode Name';
        nameInput.className = 'bm-input';
        nameInput.value = barcodeToEdit ? barcodeToEdit.name : '';
        Object.assign(nameInput.style, {
            flex: '1 1 0',
            minWidth: '0',
            width: '100%',
            boxSizing: 'border-box'
        });

        const valueInput = document.createElement('input');
        valueInput.placeholder = 'Barcode Value';
        valueInput.className = 'bm-input';
        valueInput.value = barcodeToEdit ? barcodeToEdit.value : '';
        Object.assign(valueInput.style, {
            flex: '1 1 0',
            minWidth: '0',
            width: '100%',
            boxSizing: 'border-box'
        });

        const formatSelect = document.createElement('select');
        formatSelect.className = 'bm-input';
        Object.assign(formatSelect.style, {
            flex: '1 1 0',
            minWidth: '0',
            width: '100%',
            boxSizing: 'border-box'
        });
        barcodeFormats.forEach(fmt => {
            const opt = document.createElement('option');
            opt.value = fmt.value;
            opt.textContent = fmt.label;
            formatSelect.appendChild(opt);
        });
        formatSelect.value = barcodeToEdit ? barcodeToEdit.format : 'CODE128';

        // --- Combined Folder / Sub-folder Tree Select ---
        const initFolder = barcodeToEdit ? (barcodeToEdit.folder || activeFolder || 'Default') : (activeFolder || 'Default');
        const initSub = barcodeToEdit ? (barcodeToEdit.subfolder || '') : (activeSubFolder || '');
        const treeSelect = createFolderDestinationSelect(initFolder, initSub);
        Object.assign(treeSelect.style, {
            flex: '1 1 0',
            minWidth: '0',
            width: '100%',
            boxSizing: 'border-box',
            marginBottom: '0'
        });

        function createBarcodeFormRow(...controls) {
            const row = document.createElement('div');
            Object.assign(row.style, {
                display: 'flex',
                gap: '6px',
                width: '100%',
                alignItems: 'center'
            });
            row.append(...controls);
            return row;
        }

        const topFieldRow = createBarcodeFormRow(nameInput, valueInput);
        const bottomFieldRow = createBarcodeFormRow(formatSelect, treeSelect);

        treeSelect.addEventListener('pa:folder-created-from-select', () => {
            if (!nameInput.value.trim() || !valueInput.value.trim()) return;
            setTimeout(() => createBtn.click(), 0);
        });

        const preview = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        preview.style.margin = '8px auto';
        preview.style.display = 'block';
        preview.style.overflow = 'hidden';

        const qrPreview = document.createElement('canvas');
        Object.assign(qrPreview.style, {
            display: 'none',
            width: '120px',
            height: '120px',
            margin: '4px auto'
        });

        const previewWrapper = document.createElement('div');
        Object.assign(previewWrapper.style, {
            width: '260px',
            maxWidth: '100%',
            padding: '6px',
            boxSizing: 'border-box',
            border: '1px dashed #bbb',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            margin: '0 auto'
        });
        previewWrapper.appendChild(preview);
        previewWrapper.appendChild(qrPreview);

        function calcEan13CheckDigit(d12) {
            if (!/^\d{12}$/.test(d12)) return null;
            let sum = 0;
            for (let i = 0; i < 12; i += 1) {
                const digit = Number(d12[i]);
                sum += digit * (i % 2 === 0 ? 1 : 3);
            }
            return (10 - (sum % 10)) % 10;
        }

        function calcEan8CheckDigit(d7) {
            if (!/^\d{7}$/.test(d7)) return null;
            let sum = 0;
            for (let i = 0; i < 7; i += 1) {
                const digit = Number(d7[i]);
                sum += digit * (i % 2 === 0 ? 3 : 1);
            }
            return (10 - (sum % 10)) % 10;
        }

        function calcUpcCheckDigit(d11) {
            if (!/^\d{11}$/.test(d11)) return null;
            let sum = 0;
            for (let i = 0; i < 11; i += 1) {
                const digit = Number(d11[i]);
                sum += digit * (i % 2 === 0 ? 3 : 1);
            }
            return (10 - (sum % 10)) % 10;
        }

        function makePreviewDigits(value, length) {
            const digits = String(value || '').replace(/\D/g, '').slice(0, length);
            return digits.padEnd(length, '0');
        }

        function getPreviewData(rawValue, rawFormat) {
            const value = String(rawValue || '').trim();
            if (!value) return null;
            const format = String(rawFormat || '').toUpperCase();
            let jsbFormat = format;
            let jsbValue = value;
            if (format === 'EAN13') {
                const core = makePreviewDigits(value, 12);
                const check = calcEan13CheckDigit(core);
                if (check == null) return null;
                jsbValue = core + String(check);
            } else if (format === 'EAN8') {
                const core = makePreviewDigits(value, 7);
                const check = calcEan8CheckDigit(core);
                if (check == null) return null;
                jsbValue = core + String(check);
            } else if (format === 'UPC') {
                const core = makePreviewDigits(value, 11);
                const check = calcUpcCheckDigit(core);
                if (check == null) return null;
                jsbValue = core + String(check);
            } else if (format === 'ISBN') {
                const cleaned = value.replace(/[^0-9X]/gi, '').toUpperCase();
                if (cleaned.length > 0 && cleaned.length < 10) {
                    const core = makePreviewDigits(cleaned, 9);
                    const base = `978${core}`;
                    const check = calcEan13CheckDigit(base);
                    if (check == null) return null;
                    jsbValue = base + String(check);
                    jsbFormat = 'EAN13';
                } else if (cleaned.length === 10) {
                    const core = cleaned.slice(0, 9);
                    if (!/^\d{9}$/.test(core)) return null;
                    const base = `978${core}`;
                    const check = calcEan13CheckDigit(base);
                    if (check == null) return null;
                    jsbValue = base + String(check);
                    jsbFormat = 'EAN13';
                } else if (cleaned.length === 13 && /^\d{13}$/.test(cleaned)) {
                    jsbValue = cleaned;
                    jsbFormat = 'EAN13';
                } else if (cleaned.length === 12 && /^\d{12}$/.test(cleaned)) {
                    const check = calcEan13CheckDigit(cleaned);
                    if (check == null) return null;
                    jsbValue = cleaned + String(check);
                    jsbFormat = 'EAN13';
                } else {
                    return null;
                }
            }
            return { jsbFormat, jsbValue };
        }

        const estimatePreviewModules = (fmt, len) => {
            switch (String(fmt || '').toUpperCase()) {
                case 'EAN8':
                    return 67;
                case 'EAN13':
                case 'ISBN':
                case 'UPC':
                    return 95;
                case 'CODE39':
                    return (len * 16) + 10;
                case 'ITF':
                    return (len * 14) + 6;
                case 'CODABAR':
                    return (len * 16) + 10;
                case 'MSI':
                    return (len * 12) + 8;
                case 'PHARMACODE':
                    return 50 + (len * 4);
                case 'CODE128':
                default:
                    return (len * 11) + 35;
            }
        };

        const computePreviewBarWidth = (fmt, len, targetWidthPx) => {
            const modules = estimatePreviewModules(fmt, len);
            const ideal = targetWidthPx / Math.max(1, modules);
            const minBarWidth = 0.6;
            const maxBarWidth = 2.0;
            return Math.max(minBarWidth, Math.min(maxBarWidth, ideal));
        };

        function renderPreview() {
            const val = valueInput.value.trim();
            if (!val) {
                preview.innerHTML = '';
                preview.style.display = 'block';
                qrPreview.style.display = 'none';
                if (qrPreview.getContext) {
                    const ctx = qrPreview.getContext('2d');
                    if (ctx) ctx.clearRect(0, 0, qrPreview.width, qrPreview.height);
                }
                adjustBarcodeFormPanelHeight();
                return;
            }
            if (formatSelect.value === 'QR') {
                preview.innerHTML = '';
                preview.style.display = 'none';
                qrPreview.style.display = 'block';
                if (typeof QRCode !== 'undefined' && QRCode.toCanvas) {
                    QRCode.toCanvas(qrPreview, val, { margin: 0, width: 120 }, function () {
                        adjustBarcodeFormPanelHeight();
                    });
                }
                adjustBarcodeFormPanelHeight();
                return;
            }
            qrPreview.style.display = 'none';
            preview.style.display = 'block';
            if (typeof QRCode !== 'undefined' && qrPreview.getContext) {
                const ctx = qrPreview.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, qrPreview.width, qrPreview.height);
            }
            const data = getPreviewData(val, formatSelect.value);
            if (!data) {
                preview.innerHTML = '';
                return;
            }
            try {
                const showDigits = ['EAN13', 'EAN8', 'UPC', 'ISBN'].includes(String(formatSelect.value || '').toUpperCase());
                const previewWidth = previewWrapper.getBoundingClientRect().width || 260;
                const targetWidth = Math.max(80, previewWidth - 12);
                const valueLen = Math.max(1, String(data.jsbValue ?? '').length);
                const barWidth = computePreviewBarWidth(data.jsbFormat, valueLen, targetWidth);
                const modules = estimatePreviewModules(data.jsbFormat, valueLen);
                const svgWidth = Math.round(modules * barWidth);
                preview.style.width = svgWidth + 'px';
                preview.style.height = (showDigits ? 64 : 52) + 'px';
                preview.setAttribute('shape-rendering', 'crispEdges');
                preview.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                JsBarcode(preview, data.jsbValue, {
                    format: data.jsbFormat,
                    lineColor: '#000',
                    width: barWidth,
                    height: showDigits ? 50 : 60,
                    displayValue: showDigits,
                    margin: 6,
                    fontSize: showDigits ? 12 : 0,
                    textMargin: showDigits ? 2 : 0
                });
                adjustBarcodeFormPanelHeight();
            } catch (err) {
                preview.innerHTML = '';
                adjustBarcodeFormPanelHeight();
            }
        }

        function getPixelHeight(value) {
            const n = parseFloat(String(value || '').replace('px', ''));
            return Number.isFinite(n) ? n : 0;
        }

        function adjustBarcodeFormPanelHeight() {
            setTimeout(() => {
                const footerElem = panel.querySelector('.bm-footer');
                const footerHeight = footerElem ? footerElem.offsetHeight : 0;
                const formHeight = Math.max(formWrapper.scrollHeight || 0, formWrapper.offsetHeight || 0, form.scrollHeight || 0);
                const neededHeight = formHeight + footerHeight + 70;
                const maxPanelHeight = Math.min(window.innerHeight * 0.8, 700);
                const previousHeight = getPixelHeight(prevPanelHeight) || 420;
                panel.style.height = Math.min(Math.max(previousHeight, neededHeight, 360), maxPanelHeight) + 'px';
            }, 0);
        }

        function isLikelyURL(val) {
            return /^https?:\/\//i.test(val) ||
                /^www\.[\w\-]+\.[a-z]{2,}/i.test(val) ||
                /([a-z0-9\-]+\.)+[a-z]{2,}(\/.*)?$/i.test(val);
        }

        function updateFormatOptionsForURL(val) {
            if (isLikelyURL(val)) {
                Array.from(formatSelect.options).forEach(opt => {
                    if (opt.value !== 'QR') {
                        opt.disabled = true;
                        opt.hidden = true;
                    } else {
                        opt.disabled = false;
                        opt.hidden = false;
                        formatSelect.value = 'QR';
                    }
                });
            } else {
                Array.from(formatSelect.options).forEach(opt => {
                    opt.disabled = false;
                    opt.hidden = false;
                });
            }
        }

        valueInput.addEventListener('input', () => {
            const val = valueInput.value.trim();
            updateFormatOptionsForURL(val);
            renderPreview();
        });
        updateFormatOptionsForURL(valueInput.value.trim());

        formatSelect.addEventListener('change', () => {
            renderPreview();
        });

        const btnContainer = document.createElement('div');
        Object.assign(btnContainer.style, {
            display: 'flex',
            gap: '8px',
            margin: '2px 0 0',
            justifyContent: 'center',
        });

        const createBtn = document.createElement('button');
        createBtn.textContent = barcodeToEdit ? 'Update' : 'Create';
        createBtn.className = 'bm-button';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'bm-button';

        btnContainer.appendChild(createBtn);
        btnContainer.appendChild(cancelBtn);

        form.appendChild(topFieldRow);
        form.appendChild(bottomFieldRow);
        form.appendChild(btnContainer);
        form.appendChild(previewWrapper);

        formWrapper.appendChild(form);
        setTimeout(renderPreview, 0);
        adjustBarcodeFormPanelHeight();

        form.addEventListener('submit', e => e.preventDefault());

        form.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                createBtn.click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelBtn.click();
            }
        });

        function restoreDisplayAndLayout() {
            formWrapper.innerHTML = '';
            formWrapper.style.display = 'none'; // hide formWrapper after done
            formWrapper.style.flex = '0 0 auto';
            formWrapper.style.overflow = 'visible';
            folderDisplay.style.display = 'flex';
            formWrapper.style.flexDirection = 'column';
            // Restore panel height to default
            panel.style.height = prevPanelHeight || '420px';
            // Restore footerLeft visibility
            footerLeft.style.visibility = '';
        }

        createBtn.addEventListener('click', () => {
            const name = nameInput.value.trim();
            const value = valueInput.value.trim();
            const format = formatSelect.value;
            const { folder, subfolder } = getSelectedFolderDestination(treeSelect, 'Default');
            if (!treeSelect.value || treeSelect.value === '__NEW__' || !folder || treeSelect.dataset.noFolders === '1') {
                showFlash('Create/select a folder first', true, 'error');
                return;
            }
            if (!name || !value) {
                showFlash('Name and value required', true, 'error');
                return;
            }
            if (!validateBarcodeValue(format, value)) {
                showFlash('Value is not valid for selected format', true, 'error');
                return;
            }
            if (barcodeToEdit) {
                idbUpdateBarcode(barcodeToEdit.id, { name, value, format, folder, subfolder }).then(() => {
                    restoreDisplayAndLayout();
                    activeFolder = folder || null;
                    activeSubFolder = subfolder || null;
                    renderFolders();
                    showFlash('Barcode updated', false, 'success');
                });
            } else {
                idbAddBarcode({ name, value, format, folder, subfolder, pinned: false }).then(() => {
                    restoreDisplayAndLayout();
                    activeFolder = folder || null;
                    activeSubFolder = subfolder || null;
                    renderFolders();
                    showFlash('Barcode created', false, 'success');
                });
            }
        });

        cancelBtn.addEventListener('click', () => {
            restoreDisplayAndLayout();
        });

        nameInput.focus();
    }

    // ============================================================
    // SECTION: Import, Export, Confirmation, and Rename Modals
    // ------------------------------------------------------------
    // File import/export and small modal interactions. Data merge
    // logic stays in mergeImportData; this section owns the UI.
    // ============================================================

    function showImportModal() {
        closeSearchUI();
        closeSettingsDropdown();
        closeDropdown();
        closeAllContextMenus();
        closeOpenFolderMenu();
        const existing = document.getElementById('bm-import-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'bm-import-modal';
        modal.className = 'bm-modal';
        modal.dataset.noAutoclose = '1';
        Object.assign(modal.style, {
            padding: '12px',
            minWidth: '300px',
            zIndex: '10002',
            textAlign: 'left'
        });

        const header = document.createElement('div');
        header.className = 'bm-header';
        header.textContent = 'Import File';
        header.style.fontSize = '14px';
        header.style.marginBottom = '8px';

        let pendingImport = null;

        const previewBox = document.createElement('div');
        Object.assign(previewBox.style, {
            border: '1px dashed #ccc',
            borderRadius: '6px',
            padding: '6px',
            margin: '6px 0',
            fontSize: '12px',
            color: '#666',
            background: '#fafafa',
            display: 'none'
        });

        const previewTitle = document.createElement('div');
        previewTitle.className = 'bm-text';
        previewTitle.style.fontWeight = 'bold';
        previewTitle.style.marginBottom = '4px';

        const previewBody = document.createElement('div');
        previewBody.className = 'bm-text bm-modal-scroll';
        previewBody.style.whiteSpace = 'pre-wrap';
        previewBody.style.maxHeight = '140px';
        previewBody.style.overflow = 'auto';

        previewBox.append(previewTitle, previewBody);

        const showPreview = (title, bodyText, payload) => {
            pendingImport = payload || null;
            previewTitle.textContent = title || 'Selected file';
            previewBody.textContent = bodyText || '';
            previewBox.style.display = 'block';
        };

        const formatOptions = ['CODE128', 'QR', 'EAN13', 'EAN8', 'UPC', 'ISBN', 'ITF', 'CODABAR', 'TEXT'];

        const createFolderSelect = (preferred) => {
            return createFolderDestinationSelect(preferred || 'Default', activeSubFolder || '', {
                fontSize: '12px',
                padding: '4px 6px',
                height: '28px',
                flex: '1',
                minWidth: '0'
            });
        };

        const createFormatSelect = (preferred = 'CODE128') => {
            const select = document.createElement('select');
            select.className = 'bm-input';
            select.style.fontSize = '12px';
            select.style.padding = '4px 6px';
            select.style.height = '28px';
            select.style.flex = '1';
            select.style.minWidth = '0';
            formatOptions.forEach(fmt => {
                const opt = document.createElement('option');
                opt.value = fmt;
                opt.textContent = fmt;
                select.appendChild(opt);
            });
            select.value = preferred;
            return select;
        };

        const pickFileAsArrayBuffer = (accept, onLoad) => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = accept;
            fileInput.style.display = 'none';
            fileInput.onchange = function (e) {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = function (evt) {
                    onLoad(evt.target.result, file);
                };
                reader.readAsArrayBuffer(file);
            };
            document.body.appendChild(fileInput);
            fileInput.click();
            setTimeout(() => fileInput.remove(), 1000);
        };

        const pickFile = (accept, onLoad) => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = accept;
            fileInput.style.display = 'none';
            fileInput.onchange = function (e) {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = function (evt) {
                    onLoad(String(evt.target.result || ''), file);
                };
                reader.readAsText(file);
            };
            document.body.appendChild(fileInput);
            fileInput.click();
            setTimeout(() => fileInput.remove(), 1000);
        };

        const section = (titleText) => {
            const box = document.createElement('div');
            Object.assign(box.style, {
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                padding: '8px',
                marginBottom: '8px'
            });
            const title = document.createElement('div');
            title.className = 'bm-text';
            title.style.fontWeight = 'bold';
            title.style.marginBottom = '4px';
            title.textContent = titleText;
            box.appendChild(title);
            return box;
        };

        const jsonSection = section('PA Workspace (.pa)');
        const jsonDesc = document.createElement('div');
        jsonDesc.className = 'bm-text';
        jsonDesc.style.fontSize = '12px';
        jsonDesc.style.color = '#666';
        jsonDesc.textContent = 'Use the Export File output (.pa). Includes all your workspace data.';
        const jsonBtn = document.createElement('button');
        jsonBtn.className = 'bm-button';
        jsonBtn.textContent = 'Choose .pa File';
        jsonBtn.addEventListener('click', () => {
            pickFileAsArrayBuffer('.pa', async (buffer, file) => {
                try {
                    const zip = await JSZip.loadAsync(buffer);
                    const manifestFile = zip.file("manifest.json");
                    if (!manifestFile) throw new Error("Missing manifest.json");
                    const manifestRaw = await manifestFile.async("text");
                    const manifest = JSON.parse(manifestRaw);
                    if (manifest.format !== "PA") throw new Error("Invalid format");

                    const workspaceFile = zip.file("workspace.json");
                    if (!workspaceFile) throw new Error("Missing workspace.json");
                    const workspaceRaw = await workspaceFile.async("text");
                    const data = JSON.parse(workspaceRaw);

                    const payload = normalizeBackupPayload(data);
                    const hasImportableData = [
                        payload.folders, payload.barcodes, payload.subfolders,
                        payload.bookmarkFolders, payload.bookmarkSubfolders, payload.bookmarks,
                        payload.noteFolders, payload.notes, payload.todoProjects, payload.tasks
                    ].some(arr => Array.isArray(arr) && arr.length > 0)
                        || !!payload.wellnessSettings
                        || payload.printServerOverride !== null
                        || payload.printLog !== null;

                    if (hasImportableData) {
                        const filename = file?.name || 'Selected file';
                        showPreview('PA Workspace', filename, {
                            kind: 'json',
                            payload
                        });
                    } else {
                        showFlash('No importable data found', true, 'error');
                    }
                } catch (err) {
                    WorkspaceDiagnostics.warn('Import failed', err);
                    showFlash(err.message || 'Invalid PA file', true, 'error');
                }
            });
        });
        jsonSection.append(jsonDesc, jsonBtn);
        const csvTxtSection = section('CSV / TXT');
        const csvTxtDesc = document.createElement('div');
        csvTxtDesc.className = 'bm-text';
        csvTxtDesc.style.fontSize = '12px';
        csvTxtDesc.style.color = '#666';
        csvTxtDesc.textContent = 'CSV: headers name,value,format,folder,pinned (or value,name,format,folder,pinned). TXT: one barcode per line.';

        const csvTxtFolderRow = document.createElement('div');
        Object.assign(csvTxtFolderRow.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            margin: '6px 0'
        });
        const csvTxtFolderLabel = document.createElement('div');
        csvTxtFolderLabel.className = 'bm-text';
        csvTxtFolderLabel.style.fontSize = '12px';
        csvTxtFolderLabel.textContent = 'Folder';
        const csvTxtFolderSelect = createFolderSelect(activeFolder || 'Default');
        csvTxtFolderRow.append(csvTxtFolderLabel, csvTxtFolderSelect);

        const csvTxtFormatRow = document.createElement('div');
        Object.assign(csvTxtFormatRow.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            margin: '6px 0'
        });
        const csvTxtFormatLabel = document.createElement('div');
        csvTxtFormatLabel.className = 'bm-text';
        csvTxtFormatLabel.style.fontSize = '12px';
        csvTxtFormatLabel.textContent = 'Default format';
        const csvTxtFormatSelect = createFormatSelect('CODE128');
        csvTxtFormatRow.append(csvTxtFormatLabel, csvTxtFormatSelect);

        const csvTxtBtn = document.createElement('button');
        csvTxtBtn.className = 'bm-button';
        csvTxtBtn.textContent = 'Choose CSV/TXT';
        csvTxtBtn.addEventListener('click', () => {
            if (csvTxtFolderSelect.dataset.pendingNew === '1' || csvTxtFolderSelect.value === '__NEW__') {
                showFlash('Create/select folder first', true, 'error');
                return;
            }
            pickFile('.csv,.txt,text/csv,text/plain', async (raw, file) => {
                const filename = file?.name || '';
                const isCsv = /\.csv$/i.test(filename);
                const isTxt = /\.txt$/i.test(filename) || !isCsv;

                if (isCsv) {
                    const items = parseCsvText(raw);
                    if (!items.length) {
                        showFlash('CSV file is empty', true, 'error');
                        return;
                    }
                    showPreview('CSV', filename || 'Selected file', {
                        kind: 'csv',
                        items,
                        folderSelect: csvTxtFolderSelect,
                        formatSelect: csvTxtFormatSelect
                    });
                    return;
                }

                if (isTxt) {
                    const values = parseTxtText(raw);
                    if (!values.length) {
                        showFlash('TXT file is empty', true, 'error');
                        return;
                    }
                    showPreview('TXT', filename || 'Selected file', {
                        kind: 'txt',
                        values,
                        folderSelect: csvTxtFolderSelect,
                        formatSelect: csvTxtFormatSelect
                    });
                    return;
                }
            });
        });

        csvTxtSection.append(csvTxtDesc, csvTxtFolderRow, csvTxtFormatRow, csvTxtBtn);

        const actionRow = document.createElement('div');
        Object.assign(actionRow.style, {
            textAlign: 'center',
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
            marginTop: '6px'
        });
        const okBtn = document.createElement('button');
        okBtn.className = 'bm-button';
        okBtn.textContent = 'OK';
        okBtn.addEventListener('click', async () => {
            if (!pendingImport) {
                showFlash('Select a file first', true, 'error');
                return;
            }
            if (pendingImport.kind === 'csv') {
                const defaultDest = getSelectedFolderDestination(pendingImport.folderSelect, 'Default');
                const defaults = {
                    folder: defaultDest.folder,
                    subfolder: defaultDest.subfolder,
                    format: pendingImport.formatSelect?.value || 'CODE128'
                };
                const incomingFolders = [];
                const incomingSubFolders = [];
                const incomingBarcodes = (pendingImport.items || []).map(item => {
                    const folder = item.folder || defaults.folder || 'Default';
                    const subfolder = item.subfolder || defaults.subfolder || '';
                    const format = normalizeBarcodeFormatInput(item.format || defaults.format || 'CODE128');
                    const pinned = ['1', 'true', 'yes', 'y'].includes(String(item.pinned || '').toLowerCase());
                    incomingFolders.push({ name: folder, pinned: false });
                    if (subfolder) incomingSubFolders.push({ name: subfolder, parent: folder, pinned: false });
                    return {
                        name: item.name || item.value,
                        value: item.value,
                        format,
                        folder,
                        subfolder,
                        pinned
                    };
                });
                await mergeImportData(incomingFolders, incomingBarcodes, incomingSubFolders);
                await refreshPanelAfterDataMutation();
                modal.remove();
                return;
            }
            if (pendingImport.kind === 'txt') {
                const dest = getSelectedFolderDestination(pendingImport.folderSelect, 'Default');
                const folder = dest.folder;
                const subfolder = dest.subfolder;
                const format = normalizeBarcodeFormatInput(pendingImport.formatSelect?.value || 'CODE128');
                const incomingFolders = [{ name: folder, pinned: false }];
                const incomingSubFolders = subfolder ? [{ name: subfolder, parent: folder, pinned: false }] : [];
                const incomingBarcodes = (pendingImport.values || []).map(v => ({
                    name: v,
                    value: v,
                    format,
                    folder,
                    subfolder,
                    pinned: false
                }));
                await mergeImportData(incomingFolders, incomingBarcodes, incomingSubFolders);
                await refreshPanelAfterDataMutation();
                modal.remove();
                return;
            }
            if (pendingImport.kind === 'json') {
                await importBackupData(pendingImport.payload || {});
                modal.remove();
                return;
            }
            await importBackupData(pendingImport);
            modal.remove();
        });
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'bm-button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => modal.remove());
        actionRow.append(okBtn, cancelBtn);

        modal.append(header, jsonSection, csvTxtSection, previewBox, actionRow);
        panel.appendChild(modal);
        wireModalIdleTracking(modal);

        modal.tabIndex = -1;
        modal.focus();
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                modal.remove();
            }
        });
    }

    function bmConfirm(message, callback) {
        const modal = document.createElement('div');
        modal.className = 'bm-modal';
        modal.dataset.noAutoclose = '1';
        Object.assign(modal.style, {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            borderRadius: '5px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            padding: '15px',
            zIndex: '10001',
            minWidth: '200px',
            textAlign: 'center',
        });

        const messageText = document.createElement('div');
        messageText.className = 'bm-text';
        messageText.textContent = message;
        messageText.style.marginBottom = '15px';

        const buttonsContainer = document.createElement('div');
        Object.assign(buttonsContainer.style, {
            display: 'flex',
            justifyContent: 'center',
            gap: '10px',
        });

        const yesButton = document.createElement('button');
        yesButton.className = 'bm-button';
        yesButton.textContent = 'Yes';
        yesButton.addEventListener('click', () => {
            modal.remove();
            callback(true);
        });
        const noButton = document.createElement('button');
        noButton.className = 'bm-button';
        noButton.textContent = 'No';
        noButton.addEventListener('click', () => {
            modal.remove();
            callback(false);
        });

        buttonsContainer.appendChild(yesButton);
        buttonsContainer.appendChild(noButton);

        modal.appendChild(messageText);
        modal.appendChild(buttonsContainer);

        panel.appendChild(modal);
        wireModalIdleTracking(modal);

        modal.tabIndex = -1;
        modal.focus();
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                yesButton.click();
            } else if (e.key === 'Escape') {
                noButton.click();
            }
        });
    }

    function showRenameModal(oldName, callback) {
        const modal = document.createElement('div');
        modal.className = 'bm-modal';
        modal.dataset.noAutoclose = '1';

        const header = document.createElement('div');
        header.className = 'bm-header';
        header.textContent = 'PA';
        header.style.fontWeight = 'bold';
        header.style.fontSize = '16px';
        header.style.textAlign = 'center';
        header.style.margin = '4px 0 8px 0';
        panel.appendChild(header);

        const input = document.createElement('input');
        input.className = 'bm-input';
        input.value = oldName;

        const buttonContainer = document.createElement('div');
        Object.assign(buttonContainer.style, {
            display: 'flex',
            justifyContent: 'space-around',
            marginTop: '10px',
        });

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = 'Rename';
        confirmBtn.className = 'bm-button';
        confirmBtn.addEventListener('click', () => {
            callback(input.value);
            modal.remove();
        });
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'bm-button';
        cancelBtn.addEventListener('click', () => {
            callback(null);
            modal.remove();
        });

        buttonContainer.appendChild(confirmBtn);
        buttonContainer.appendChild(cancelBtn);

        modal.appendChild(header);
        modal.appendChild(input);
        modal.appendChild(buttonContainer);

        panel.appendChild(modal);
        wireModalIdleTracking(modal);
        input.focus();

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                confirmBtn.click();
            } else if (e.key === 'Escape') {
                cancelBtn.click();
            }
        });
    }

    // ============================================================
    // SECTION: Main Renderer - Folder Grid and Barcode Grid
    // ------------------------------------------------------------
    // renderFolders is the central UI refresh function. It renders
    // either the root folder grid or the active folder's barcodes.
    // ============================================================

    async function renderFolders(options = {}) {
        const renderId = ++renderSeq;
        const isStale = () => renderId !== renderSeq;
        const isFormOpen = formWrapper.style.display !== 'none' && formWrapper.innerHTML !== '';
        if (options.backgroundSync && isFormOpen) {
            return; // Don't disrupt active barcode editing
        }
        folderDisplay.style.display = 'flex';
        formWrapper.style.display = 'none'; // always hide formWrapper unless creating/editing
        folderDisplay.innerHTML = '';
        let folderMenu = null;
        let barcodeMenu = null;
        if (activeFolder) {
            const inSubFolder = !!activeSubFolder;
            // --- Folder Header Row ---
            const folderHeaderRow = document.createElement('div');
            folderHeaderRow.style.display = 'flex';
            folderHeaderRow.style.flexDirection = 'row';
            folderHeaderRow.style.alignItems = 'center';
            folderHeaderRow.style.justifyContent = inSubFolder ? 'center' : 'space-between';
            folderHeaderRow.style.gap = '8px';
            folderHeaderRow.style.marginBottom = '10px';
            folderHeaderRow.style.width = '100%';

            // Back button
            const backBtn = document.createElement('button');
            backBtn.textContent = '⬅Back';
            backBtn.className = 'bm-button';
            backBtn.style.marginBottom = '0';
            backBtn.style.flex = '0 0 auto';
            backBtn.addEventListener('click', () => {
                if (activeSubFolder) {
                    activeSubFolder = null;
                } else {
                    activeFolder = null;
                }
                renderFolders();
            });

            // Folder name (breadcrumb)
            const folderNameDiv = document.createElement('div');
            folderNameDiv.className = 'bm-header folder-name';
            folderNameDiv.textContent = inSubFolder ? `${activeFolder} / ${activeSubFolder}` : activeFolder;
            Object.assign(folderNameDiv.style, {
                fontWeight: 'bold',
                fontSize: '13px',
                color: '#000',
                letterSpacing: '1px',
                textAlign: 'center',
                margin: '0',
                display: 'block',
                flex: '1 1 0%',
                minWidth: '0',
                marginRight: inSubFolder ? '100px' : '0'
            });

            folderHeaderRow.appendChild(backBtn);
            folderHeaderRow.appendChild(folderNameDiv);

            // Add Sub-folder button
            const addSfBtn = document.createElement('button');
            addSfBtn.textContent = '\uFF0B Sub-folder';
            addSfBtn.className = 'bm-button';
            addSfBtn.style.marginBottom = '0';
            addSfBtn.style.flex = '0 0 auto';
            if (inSubFolder) {
                addSfBtn.style.opacity = '0.5';
                addSfBtn.style.cursor = 'not-allowed';
                addSfBtn.title = 'Maximum folder depth reached (2 levels)';
                addSfBtn.addEventListener('click', () => {
                    showFlash('Maximum folder depth reached (2 levels)', true, 'warning');
                });
            } else {
                addSfBtn.addEventListener('click', () => {
                    showNewFolderModal((name) => {
                        if (name !== null) saveSubFolder(activeFolder, name);
                    });
                });
            }
            folderHeaderRow.appendChild(addSfBtn);

            // Remove any previous folder name header
            const prevFolderName = panel.querySelector('.bm-header.folder-name');
            if (prevFolderName) prevFolderName.remove();

            // --- Sub-folder cards (only at folder level) ---
            let subFolderListSection = null;
            if (!inSubFolder) {
                subFolderListSection = document.createElement('div');
                subFolderListSection.style.display = 'flex';
                subFolderListSection.style.flexWrap = 'wrap';
                subFolderListSection.style.gap = '8px';
                subFolderListSection.style.width = '100%';
                subFolderListSection.style.justifyContent = 'flex-start';
                subFolderListSection.style.marginBottom = '8px';

                const folderSubFolders = getSubFolders(activeFolder);
                folderSubFolders.sort((a, b) => {
                    if (a.pinned && !b.pinned) return -1;
                    if (!a.pinned && b.pinned) return 1;
                    return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
                });

                const subFolderBarcodes = await idbGetBarcodesByFolder(activeFolder);
                if (isStale()) return;

                const subFolderEmptySVG = `
                    <svg width="36" height="36" viewBox="0 0 491.52 491.52" xmlns="http://www.w3.org/2000/svg">
                    <g>
                    <path style="fill:#5b8def;" d="M445.522,88.989h-259.23c-5.832,0-11.24-3.318-14.26-8.749l-13.88-24.957
                    c-3.021-5.432-8.427-8.749-14.259-8.749H45.998c-9.208,0-16.671,8.126-16.671,18.15v362.151c0,10.024,7.463,18.15,16.671,18.15
                    h399.523c9.207,0,16.671-8.126,16.671-18.15V107.14C462.192,97.116,454.728,88.989,445.522,88.989z"/>
                    <path style="fill:#7ba7f5;" d="M474.806,216.429H16.714c-10.557,0-17.956,8.348-16.541,18.538l27.158,195.639
                    c1.107,7.974,9.46,14.379,18.667,14.379h399.523c9.207,0,17.56-6.405,18.667-14.379l27.158-195.639
                    C492.761,224.777,485.362,216.429,474.806,216.429z"/>
                    </g>
                    </svg>
                `;
                const subFolderFullSVG = `
                    <svg width="36" height="36" viewBox="0 0 491.52 491.52" xmlns="http://www.w3.org/2000/svg">
                    <g>
                    <path style="fill:#5b8def;" d="M445.522,88.989h-259.23c-5.832,0-11.24-3.318-14.26-8.749l-13.88-24.957
                    c-3.021-5.432-8.427-8.749-14.259-8.749H45.998c-9.208,0-16.671,8.126-16.671,18.15v362.151c0,10.024,7.463,18.15,16.671,18.15
                    h399.523c9.207,0,16.671-8.126,16.671-18.15V107.14C462.192,97.116,454.728,88.989,445.522,88.989z"/>
                    <rect x="55.383" y="133.12" style="fill:#EBF0F3;" width="385.536" height="122.092"/>
                    <rect x="55.383" y="150.17" style="fill:#FFFFFF;" width="385.536" height="122.092"/>
                    <path style="fill:#7ba7f5;" d="M474.806,216.429H16.714c-10.557,0-17.956,8.348-16.541,18.538l27.158,195.639
                    c1.107,7.974,9.46,14.379,18.667,14.379h399.523c9.207,0,17.56-6.405,18.667-14.379l27.158-195.639
                    C492.761,224.777,485.362,216.429,474.806,216.429z"/>
                    </g>
                    </svg>
                `;

                folderSubFolders.forEach(sf => {
                    const sfIconWrapper = document.createElement('div');
                    sfIconWrapper.className = 'bm-folder-icon-wrapper';
                    sfIconWrapper.style.cursor = 'pointer';
                    sfIconWrapper.title = sf.name;

                    const sfIcon = document.createElement('div');
                    sfIcon.className = 'bm-folder-icon';
                    const sfHasBarcodes = subFolderBarcodes.some(b => (b.subfolder || '').toLowerCase() === sf.name.toLowerCase());
                    sfIcon.innerHTML = sfHasBarcodes ? subFolderFullSVG : subFolderEmptySVG;

                    const sfLabel = document.createElement('div');
                    sfLabel.textContent = sf.pinned ? `📌 ${sf.name}` : sf.name;
                    sfLabel.className = 'bm-text bm-folder-label';
                    sfLabel.title = sf.name;

                    sfIconWrapper.addEventListener('dblclick', () => {
                        activeSubFolder = sf.name;
                        renderFolders();
                    });

                    const sfMenuIcon = document.createElement('div');
                    sfMenuIcon.textContent = '\u22EE';
                    sfMenuIcon.style.cursor = 'pointer';
                    sfMenuIcon.style.marginLeft = '8px';
                    sfMenuIcon.style.opacity = '0.6';
                    sfMenuIcon.style.fontSize = '18px';
                    sfMenuIcon.style.padding = '0 4px';
                    sfMenuIcon.className = 'bm-folder-menu-icon';

                    sfMenuIcon.addEventListener('click', (e) => {
                        e.stopPropagation();
                        formWrapper.innerHTML = '';
                        closeOpenFolderMenu();
                        closeDropdown();
                        closeAllContextMenus();
                        if (folderMenu) {
                            folderMenu.remove();
                            folderMenu = null;
                            return;
                        }
                        folderMenu = buildContextMenu('bm-folder-menu-open');
                        const closeSfMenu = openContextMenuAtEvent(folderMenu, e, sfMenuIcon, () => {
                            folderMenu = null;
                        });

                        const renameSfBtn = document.createElement('button');
                        renameSfBtn.textContent = '\u270F\uFE0F Rename';
                        renameSfBtn.className = 'bm-button';
                        renameSfBtn.addEventListener('click', () => {
                            closeSfMenu();
                            showRenameModal(sf.name, (newName) => {
                                if (newName && newName.trim() !== '' && newName.toLowerCase() !== sf.name.toLowerCase()) {
                                    renameSubFolder(activeFolder, sf.name, newName);
                                } else if (newName !== null) {
                                    showFlash('Invalid sub-folder name', true, 'error');
                                }
                            });
                        });

                        const printSfBtn = document.createElement('button');
                        printSfBtn.textContent = '🖨️ Print All';
                        printSfBtn.className = 'bm-button';
                        printSfBtn.addEventListener('click', () => {
                            closeSfMenu();
                            (async () => {
                                const sfBarcodes = await idbGetBarcodesByFolder(activeFolder, sf.name);
                                if (!sfBarcodes || sfBarcodes.length === 0) {
                                    showFlash('Sub-folder is empty', true, 'error');
                                    return;
                                }
                                let successCount = 0;
                                let attemptedCount = 0;
                                for (const b of sfBarcodes) {
                                    const value = b?.value;
                                    if (value == null || String(value).trim() === '') continue;
                                    attemptedCount++;
                                    const ok = await printBarcodeValue(value, b.format, 1, {
                                        silent: true,
                                        useRawText: true,
                                        label: b?.name || ''
                                    });
                                    if (ok) successCount++;
                                }
                                if (attemptedCount === 0) {
                                    showFlash('Nothing to print', true, 'error');
                                    return;
                                }
                                const isError = successCount < attemptedCount;
                                const message = isError
                                    ? `Print result: ${successCount}/${attemptedCount}`
                                    : `Sent to printer: ${successCount}/${attemptedCount}`;
                                showFlash(message, isError, isError ? 'error' : 'success');
                            })();
                        });

                        const formatSfBtn = document.createElement('button');
                        formatSfBtn.textContent = '🔁 Change Format';
                        formatSfBtn.className = 'bm-button';
                        formatSfBtn.addEventListener('click', () => {
                            closeSfMenu();
                            showFolderChangeFormatModal(activeFolder, sf.name);
                        });

                        const moveSfBtn = document.createElement('button');
                        moveSfBtn.textContent = '📂 Move';
                        moveSfBtn.className = 'bm-button';
                        moveSfBtn.addEventListener('click', () => {
                            closeSfMenu();
                            showMoveModal('subfolder', sf.name, activeFolder);
                        });

                        const deleteSfBtn = document.createElement('button');
                        deleteSfBtn.textContent = '\uD83D\uDDD1\uFE0F Delete';
                        deleteSfBtn.className = 'bm-button';
                        deleteSfBtn.addEventListener('click', () => {
                            closeSfMenu();
                            bmConfirm(`Delete sub-folder "${sf.name}" and all its barcodes?`, (result) => {
                                if (result) deleteSubFolder(activeFolder, sf.name);
                            });
                        });

                        const pinSfBtn = document.createElement('button');
                        pinSfBtn.textContent = sf.pinned ? '📌 Unpin' : '📍 Pin';
                        pinSfBtn.className = 'bm-button';
                        pinSfBtn.addEventListener('click', () => {
                            updateSubFolder(activeFolder, sf.name, { pinned: !sf.pinned });
                            showFlash(sf.pinned ? 'Sub-folder unpinned' : 'Sub-folder pinned', false, 'success');
                            closeSfMenu();
                        });

                        folderMenu.append(renameSfBtn, printSfBtn, formatSfBtn, moveSfBtn, deleteSfBtn, pinSfBtn);
                    });

                    sfIconWrapper.appendChild(sfIcon);
                    sfIconWrapper.appendChild(sfLabel);
                    sfIconWrapper.appendChild(sfMenuIcon);
                    subFolderListSection.appendChild(sfIconWrapper);
                });
            }


            // --- Barcode List Container ---
            const barcodeListContainer = document.createElement('div');
            barcodeListContainer.style.display = 'flex';
            barcodeListContainer.style.flexWrap = 'wrap';
            barcodeListContainer.style.flexDirection = 'row';
            barcodeListContainer.style.gap = '8px';
            barcodeListContainer.style.width = '100%';
            barcodeListContainer.style.justifyContent = 'flex-start'; // align to top/left
            barcodeListContainer.style.alignContent = 'flex-start'; // align to top

            const barcodes = await idbGetBarcodesByFolder(activeFolder, activeSubFolder || '');
            if (isStale()) return;

            barcodes.sort((a, b) => {
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
            });

            if (!window._barcodeFlashActive) {
                const folderSubCount = inSubFolder ? 0 : getSubFolders(activeFolder).length;
                if (barcodes.length === 0 && folderSubCount === 0) {
                    footerCenter.dataset.bmSystemMessage = '1';
                    const emptyMsg = inSubFolder ? 'This sub-folder is empty' : 'This folder is empty';
                    footerCenter.textContent = emptyMsg;
                    footerCenter.className = 'bm-flash info';
                    footerCenter.title = emptyMsg;
                    footerCenter.style.display = 'flex';
                } else {
                    footerCenter.dataset.bmSystemMessage = '0';
                    footerCenter.textContent = '';
                    footerCenter.className = '';
                    footerCenter.title = '';
                    footerCenter.style.display = 'flex';
                    renderFooterQuoteIfAllowed();
                }
            }

            const selectedCount = barcodes.filter(b => selectedBarcodeIds.has(b.id)).length;
            let batchBar = null;
            if (selectedCount > 0) {
                batchBar = document.createElement('div');
                batchBar.className = 'bm-batch-bar';

                const selectAllBtn = document.createElement('button');
                selectAllBtn.className = 'bm-batch-btn';
                selectAllBtn.textContent = selectedCount === barcodes.length ? 'Unselect All' : 'Select All';
                selectAllBtn.addEventListener('click', () => {
                    if (selectedCount === barcodes.length) {
                        selectedBarcodeIds.clear();
                    } else {
                        barcodes.forEach(b => selectedBarcodeIds.add(b.id));
                    }
                    renderFolders();
                });

                const copyBtn = document.createElement('button');
                copyBtn.className = 'bm-batch-btn';
                copyBtn.textContent = '📝';
                copyBtn.title = `Copy (${selectedCount})`;
                copyBtn.addEventListener('click', () => {
                    const selectedValues = barcodes
                        .filter(b => selectedBarcodeIds.has(b.id))
                        .map(b => b.value)
                        .filter(v => v != null && String(v).trim() !== '');
                    if (selectedValues.length === 0) {
                        showFlash('Nothing to copy', true, 'error');
                        return;
                    }
                    copyToClipboard(selectedValues.join('\n'));
                });

                const moveBtn = document.createElement('button');
                moveBtn.className = 'bm-batch-btn';
                moveBtn.textContent = '📂';
                moveBtn.title = `Move (${selectedCount})`;
                moveBtn.addEventListener('click', () => {
                    const ids = Array.from(selectedBarcodeIds);
                    if (ids.length === 0) {
                        showFlash('Nothing to move', true, 'error');
                        return;
                    }
                    showMoveBarcodesModal(ids, async () => {
                        selectedBarcodeIds.clear();
                        await renderFolders();
                        showFlash(`Moved ${ids.length} barcode(s)`, false, 'success');
                    });
                });

                const printCopiesInput = createPrintCopiesInput();

                const printBtn = document.createElement('button');
                printBtn.className = 'bm-batch-btn';
                printBtn.textContent = '🖨️';
                printBtn.title = `Print (${selectedCount})`;
                printBtn.addEventListener('click', async () => {
                    const selectedBarcodes = barcodes.filter(b => selectedBarcodeIds.has(b.id));
                    const copies = getPrintCopies(printCopiesInput);
                    let successCount = 0;
                    let attemptedCount = 0;

                    for (const b of selectedBarcodes) {
                        const value = b?.value;
                        if (value == null || String(value).trim() === '') continue;
                        attemptedCount++;

                        const ok = await printBarcodeValue(value, b.format, copies, {
                            silent: true,
                            useRawText: true,
                            label: b?.name || ''
                        });
                        if (ok) successCount++;
                    }

                    if (attemptedCount === 0) {
                        showFlash('Nothing to print', true, 'error');
                        return;
                    }

                    const isError = successCount < attemptedCount;
                    const message = isError
                        ? `Print result: ${successCount}/${attemptedCount}`
                        : `Sent to printer: ${successCount}/${attemptedCount}`;
                    showFlash(message, isError, isError ? 'error' : 'success');
                });

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'bm-batch-btn';
                deleteBtn.textContent = '🗑️';
                deleteBtn.title = `Delete (${selectedCount})`;
                deleteBtn.addEventListener('click', () => {
                    bmConfirm(`Delete ${selectedCount} selected barcode(s)?`, async (result) => {
                        if (!result) return;
                        const ids = Array.from(selectedBarcodeIds);
                        await deleteBarcodesByIds(ids);
                        selectedBarcodeIds.clear();
                        await renderFolders();
                        showFlash('Selected barcodes deleted', false, 'success');
                    });
                });

                batchBar.append(selectAllBtn, copyBtn, moveBtn, deleteBtn, printBtn, printCopiesInput);
            }

            const createBarcodeItem = (barcode) => {
                const barcodeDiv = document.createElement('div');
                barcodeDiv.className = 'bm-barcode-item';
                barcodeDiv.setAttribute('data-barcode-id', String(barcode.id));
                barcodeDiv.style.display = 'inline-flex';
                barcodeDiv.style.flexDirection = 'column';
                barcodeDiv.style.alignItems = 'center';
                barcodeDiv.style.gap = '2px';
                barcodeDiv.style.margin = '4px';

                const formatClass = String(barcode.format || 'CODE128')
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-');
                barcodeDiv.classList.add(`bm-format-${formatClass}`);

                const rowDiv = document.createElement('div');
                rowDiv.style.display = 'flex';
                rowDiv.style.flexDirection = 'row';
                rowDiv.style.alignItems = 'flex-start';
                rowDiv.style.width = '100%';
                rowDiv.style.position = 'relative';

                let barcodePreview;
                const QR_PREVIEW_SIZE = QR_PREVIEW_DEFAULT_SIZE;
                const BARCODE_LIST_GAP = 8;
                const BARCODE_ITEM_MARGIN = 4;
                const QR_PAIR_GAP = BARCODE_LIST_GAP + (BARCODE_ITEM_MARGIN * 2);
                const LINEAR_PREVIEW_WIDTH = (QR_PREVIEW_SIZE * 2) + QR_PAIR_GAP;
                if (barcode.format === 'TEXT') {
                    const textPreview = document.createElement('div');
                    textPreview.className = 'bm-text-preview';
                    textPreview.textContent = String(barcode.value || '').split('\n').slice(0, 8).join('\n');
                    addTextPageDivider(textPreview, 10 * 1.2, TEXT_LINES_PER_PAGE, '#999');
                    barcodePreview = textPreview;
                } else if (barcode.format === 'QR' || barcode.format === '2D') {
                    const valueStr = String(barcode.value || '');
                    const cacheKey = getQrPreviewCacheKey(valueStr, QR_PREVIEW_SIZE);
                    const cachedUrl = qrPreviewCache.get(cacheKey);
                    if (cachedUrl) {
                        touchQrPreviewCacheKey(cacheKey);
                        queueSaveQrPreviewCache();
                        const img = document.createElement('img');
                        img.src = cachedUrl;
                        img.width = QR_PREVIEW_SIZE;
                        img.height = QR_PREVIEW_SIZE;
                        img.style.width = QR_PREVIEW_SIZE + 'px';
                        img.style.height = QR_PREVIEW_SIZE + 'px';
                        img.style.display = 'block';
                        img.className = 'bm-barcode-preview';
                        barcodePreview = img;
                    } else {
                        const canvas = document.createElement('canvas');
                        canvas.width = QR_PREVIEW_SIZE;
                        canvas.height = QR_PREVIEW_SIZE;
                        canvas.style.width = QR_PREVIEW_SIZE + 'px';
                        canvas.style.height = QR_PREVIEW_SIZE + 'px';
                        canvas.className = 'bm-barcode-preview';
                        barcodePreview = canvas;
                        scheduleIdle(() => {
                            try {
                                if (typeof QRCode !== 'undefined' && QRCode.toDataURL) {
                                    QRCode.toDataURL(valueStr, { margin: 0, width: QR_PREVIEW_SIZE }, function (err, url) {
                                        if (err || !url) return;
                                        setQrPreviewCacheEntry(cacheKey, url);
                                        if (canvas && canvas.parentNode) {
                                            const img = document.createElement('img');
                                            img.src = url;
                                            img.width = QR_PREVIEW_SIZE;
                                            img.height = QR_PREVIEW_SIZE;
                                            img.style.width = QR_PREVIEW_SIZE + 'px';
                                            img.style.height = QR_PREVIEW_SIZE + 'px';
                                            img.style.display = 'block';
                                            img.className = 'bm-barcode-preview';
                                            canvas.replaceWith(img);
                                        }
                                    });
                                    return;
                                }
                                if (typeof QRCode !== 'undefined' && QRCode.toCanvas) {
                                    QRCode.toCanvas(canvas, valueStr, { margin: 0, width: QR_PREVIEW_SIZE }, function () { });
                                }
                            } catch (err) {
                                canvas.style.display = 'none';
                            }
                        });
                    }
                } else if (
                    barcode.format === 'EAN13' ||
                    barcode.format === 'EAN8' ||
                    barcode.format === 'UPC' ||
                    barcode.format === 'CODE128' ||
                    barcode.format === 'ISBN' ||
                    barcode.format === 'ITF' ||
                    barcode.format === 'CODABAR' ||
                    barcode.format === 'CODE39' ||
                    barcode.format === 'MSI' ||
                    barcode.format === 'PHARMACODE' ||
                    barcode.format === 'B00' ||
                    barcode.format === 'LPN' ||
                    barcode.format === 'X00'
                ) {
                    const wrapper = document.createElement('div');
                    Object.assign(wrapper.style, {
                        width: LINEAR_PREVIEW_WIDTH + 'px',
                        padding: '1px 2px 1px 1px',
                        boxSizing: 'border-box',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        overflow: 'hidden'
                    });

                    const canvas = document.createElement('canvas');
                    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
                    const showDigits = ['UPC', 'EAN13', 'EAN8', 'ISBN'].includes(barcode.format);
                    const displayHeight = showDigits ? 80 : 60;
                    canvas.className = 'bm-barcode-preview-linear';
                    try {
                        let jsbFormat = barcode.format;
                        if (['B00', 'LPN', 'X00'].includes(barcode.format)) {
                            jsbFormat = 'CODE128';
                        } else if (barcode.format === 'ISBN') {
                            jsbFormat = 'EAN13';
                        } else if (barcode.format === 'PHARMACODE') {
                            jsbFormat = 'pharmacode';
                        }

                        const valueStr = String(barcode.value ?? '');
                        const valueLen = Math.max(1, valueStr.length);
                        const estimateModules = (fmt, len) => {
                            switch (String(fmt || '').toUpperCase()) {
                                case 'EAN8':
                                    return 67;
                                case 'EAN13':
                                case 'ISBN':
                                case 'UPC':
                                    return 95;
                                case 'CODE39':
                                    return (len * 16) + 10;
                                case 'ITF':
                                    return (len * 14) + 6;
                                case 'CODABAR':
                                    return (len * 16) + 10;
                                case 'MSI':
                                    return (len * 12) + 8;
                                case 'PHARMACODE':
                                    return 50 + (len * 4);
                                case 'CODE128':
                                default:
                                    return (len * 11) + 35;
                            }
                        };
                        const FIXED_BAR_WIDTH = 3.2 * dpr;
                        const minBarWidth = 1 * dpr;
                        const moduleFmt = String(jsbFormat || '').toUpperCase() === 'PHARMACODE' ? 'PHARMACODE' : jsbFormat;
                        const modules = estimateModules(moduleFmt, valueLen);
                        const availableWidthPx = Math.max(40, LINEAR_PREVIEW_WIDTH - 4);
                        const fitToBox = Math.max(minBarWidth, (availableWidthPx * dpr) / Math.max(1, modules));
                        const fitBarWidth = Math.max(minBarWidth, Math.min(FIXED_BAR_WIDTH, fitToBox));
                        const contentWidthCss = Math.max(1, Math.round((modules * fitBarWidth) / dpr));

                        canvas.width = Math.round(contentWidthCss * dpr);
                        canvas.height = displayHeight * dpr;
                        canvas.style.width = contentWidthCss + 'px';
                        canvas.style.height = displayHeight + 'px';
                        canvas.style.imageRendering = 'pixelated';
                        canvas.style.maxWidth = '100%';

                        JsBarcode(canvas, barcode.value, {
                            format: jsbFormat,
                            lineColor: '#000',
                            width: fitBarWidth,
                            height: (showDigits ? 68 : 56) * dpr,
                            displayValue: showDigits,
                            fontSize: (showDigits ? 14 : 12) * dpr,
                            textMargin: (showDigits ? 4 : 2) * dpr,
                            margin: 0
                        });
                        const ctx = canvas.getContext('2d');
                        if (ctx) ctx.imageSmoothingEnabled = false;
                    } catch (err) {
                        canvas.style.display = 'none';
                    }
                    wrapper.appendChild(canvas);
                    barcodePreview = wrapper;
                } else {
                    barcodePreview = document.createElement('span');
                    barcodePreview.textContent = `[${barcode.format}]`;
                    barcodePreview.style.color = 'red';
                    barcodePreview.style.fontWeight = 'bold';
                    barcodePreview.style.fontSize = '12px';
                }
                rowDiv.appendChild(barcodePreview);

                barcodePreview.style.cursor = 'zoom-in';
                barcodePreview.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (!isInsideTightHitbox(e, barcodePreview)) return;
                    localStorage.setItem(STORAGE_KEYS.BARCODE_MODAL, JSON.stringify({
                        open: true,
                        value: barcode.value,
                        format: barcode.format,
                        name: barcode.name
                    }));
                    showBigBarcodeModal(barcode.value, barcode.format, barcode.name);
                });

                const menuIcon = document.createElement('div');
                menuIcon.textContent = '⋮';
                menuIcon.style.cursor = 'pointer';
                menuIcon.style.marginLeft = '4px';
                menuIcon.style.opacity = '1';
                menuIcon.style.fontSize = '18px';
                menuIcon.style.padding = '0 0px';

                const menuColumn = document.createElement('div');
                Object.assign(menuColumn.style, {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0px'
                });

                const batchCheckbox = document.createElement('input');
                batchCheckbox.type = 'checkbox';
                batchCheckbox.className = 'bm-batch-checkbox';
                batchCheckbox.title = 'Select for batch print';
                batchCheckbox.checked = selectedBarcodeIds.has(barcode.id);
                batchCheckbox.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (batchCheckbox.checked) {
                        selectedBarcodeIds.add(barcode.id);
                    } else {
                        selectedBarcodeIds.delete(barcode.id);
                    }
                    renderFolders();
                });

                let barcodeMenu = null;
                menuIcon.addEventListener('click', (e) => {
                    e.stopPropagation();

                    closeAllContextMenus();

                    if (barcodeMenu) {
                        barcodeMenu.remove();
                        barcodeMenu = null;
                        return;
                    }

                    barcodeMenu = buildContextMenu('bm-barcode-menu-open');
                    const closeBarcodeMenu = openContextMenuAtEvent(barcodeMenu, e, menuIcon, () => {
                        barcodeMenu = null;
                    });

                    const editBtn = document.createElement('button');
                    editBtn.textContent = '✏️ Edit';
                    editBtn.className = 'bm-button';
                    editBtn.addEventListener('click', () => {
                        closeBarcodeMenu();
                        if (barcode.format === 'TEXT') {
                            showTextEditModal(barcode);
                        } else {
                            showBarcodeForm(barcode);
                        }
                    });

                    const deleteBtn = document.createElement('button');
                    deleteBtn.textContent = '🗑️ Delete';
                    deleteBtn.className = 'bm-button';
                    deleteBtn.addEventListener('click', () => {
                        closeBarcodeMenu();
                        bmConfirm(`Delete barcode "${barcode.name}"?`, async (result) => {
                            if (result) {
                                await idbDeleteBarcode(barcode.id);
                                renderFolders();
                                showFlash('Barcode deleted', false, 'success');
                            }
                        });
                    });

                    const pinBtn = document.createElement('button');
                    pinBtn.textContent = barcode.pinned ? '📌 Unpin' : '📍 Pin';
                    pinBtn.className = 'bm-button';
                    pinBtn.addEventListener('click', async () => {
                        await idbUpdateBarcode(barcode.id, { pinned: !barcode.pinned });
                        renderFolders();
                        showFlash(barcode.pinned ? 'Barcode unpinned' : 'Barcode pinned', false, 'success');
                        closeBarcodeMenu();
                    });

                    barcodeMenu.append(editBtn, deleteBtn, pinBtn);
                });

                if (barcode.format !== 'TEXT') {
                    const sendBtn = document.createElement('button');
                    sendBtn.className = 'bm-modal-action-btn';
                    sendBtn.innerHTML = '📤';
                    sendBtn.title = 'Send like scanner';
                    sendBtn.style.marginTop = '2px';
                    sendBtn.style.padding = '0';
                    sendBtn.style.minWidth = '0';
                    sendBtn.style.lineHeight = '1';
                    sendBtn.style.display = 'inline-flex';
                    sendBtn.style.alignItems = 'center';
                    sendBtn.style.justifyContent = 'center';
                    sendBtn.style.background = 'transparent';
                    sendBtn.style.border = 'none';
                    sendBtn.style.boxShadow = 'none';
                    sendBtn.style.borderRadius = '0';
                    sendBtn.style.color = 'inherit';
                    sendBtn.style.fontSize = '16px';
                    sendBtn.style.cursor = 'pointer';
                    sendBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const originalIcon = sendBtn.innerHTML;
                        const originalColor = sendBtn.style.color;

                        Promise.resolve()
                            .then(() => sendValueToPage(barcode.value))
                            .then((ok) => {
                                if (ok !== false) {
                                    sendBtn.innerHTML = '✅';
                                    sendBtn.style.color = '#2e7d32';
                                } else {
                                    sendBtn.innerHTML = '❌';
                                    sendBtn.style.color = '#c62828';
                                }
                                setTimeout(() => {
                                    sendBtn.innerHTML = originalIcon;
                                    sendBtn.style.color = originalColor;
                                }, 1200);
                            })
                            .catch(() => {
                                sendBtn.innerHTML = '❌';
                                sendBtn.style.color = '#c62828';
                                setTimeout(() => {
                                    sendBtn.innerHTML = originalIcon;
                                    sendBtn.style.color = originalColor;
                                }, 1200);
                            });
                    });

                    menuColumn._bmSendBtn = sendBtn;
                }

                menuColumn.appendChild(menuIcon);
                menuColumn.appendChild(batchCheckbox);
                if (menuColumn._bmSendBtn) {
                    menuColumn.appendChild(menuColumn._bmSendBtn);
                    delete menuColumn._bmSendBtn;
                }
                rowDiv.appendChild(menuColumn);

                barcodeDiv.appendChild(rowDiv);

                let nameElem;
                const isLikelyURL = (val) => {
                    return /^https?:\/\//i.test(val) ||
                        /^www\.[\w\-]+\.[a-z]{2,}/i.test(val) ||
                        /^[\w\-]+\.[a-z]{2,}(\/.*)?$/i.test(val);
                };
                if (isLikelyURL(barcode.value)) {
                    let url = barcode.value;
                    if (!/^https?:\/\//i.test(url)) {
                        url = 'https://' + url;
                    }
                    nameElem = document.createElement('a');
                    nameElem.href = url;
                    nameElem.textContent = barcode.pinned ? `📌 ${barcode.name}` : barcode.name;
                    nameElem.target = '_blank';
                    nameElem.style.color = '#1976d2';
                    nameElem.style.textDecoration = 'underline';
                } else {
                    nameElem = document.createElement('span');
                    nameElem.textContent = barcode.pinned ? `📌 ${barcode.name}` : barcode.name;
                }
                nameElem.title = barcode.value;
                nameElem.style.fontSize = '12px';
                nameElem.style.marginTop = '2px';

                barcodeDiv.appendChild(nameElem);

                return barcodeDiv;
            };

            folderDisplay.appendChild(folderHeaderRow);
            if (subFolderListSection) {
                folderDisplay.appendChild(subFolderListSection);
            }
            if (batchBar) {
                folderDisplay.appendChild(batchBar);
            }
            folderDisplay.appendChild(barcodeListContainer);

            const CHUNK_SIZE = 30;
            const renderChunk = (startIndex) => {
                if (isStale()) return;
                const endIndex = Math.min(startIndex + CHUNK_SIZE, barcodes.length);
                const frag = document.createDocumentFragment();
                for (let i = startIndex; i < endIndex; i += 1) {
                    frag.appendChild(createBarcodeItem(barcodes[i]));
                }
                barcodeListContainer.appendChild(frag);
                if (endIndex < barcodes.length) {
                    requestAnimationFrame(() => renderChunk(endIndex));
                }
            };

            renderChunk(0);
            return;
        }

        selectedBarcodeIds.clear();

        if (!window._barcodeFlashActive) {
            footerCenter.dataset.bmSystemMessage = '0';
            footerCenter.textContent = '';
            footerCenter.className = '';
            footerCenter.title = '';
            footerCenter.style.display = 'flex';
            renderFooterQuoteIfAllowed();
        }

        let folders = await getFolders();
        if (isStale()) return;
        const allBarcodes = await getBarcodes();
        if (isStale()) return;

        if (folders.length === 0 && allBarcodes.length === 0 && !barcodeSearchQuery) {
            folderDisplay.appendChild(createFeatureWelcomeState({
                title: '📦 Barcode Manager',
                description: 'Store frequently used barcodes.',
                examples: ['Work Station', 'Drop Zone', 'Stage', 'Location', 'Package , .....'],
                buttonText: '+ Add First Barcode',
                onButtonClick: () => showBarcodeForm(),
                features: ['Barcode preview', 'QR generation', 'Print labels', 'Folder organization']
            }));
            return;
        }

        folders.forEach(f => {
            f.barcodeCount = allBarcodes.filter(b => (b.folder || '').toLowerCase() === f.name.toLowerCase()).length;
        });

        folders.sort((a, b) => {
            if (a.pinned && b.pinned) {
                return (a.order || 0) - (b.order || 0);
            }
            if (a.pinned) return -1;
            if (b.pinned) return 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });

        folders.forEach(folder => {
            const iconWrapper = document.createElement('div');
            iconWrapper.className = 'bm-folder-icon-wrapper';
            iconWrapper.setAttribute('data-folder', folder.name);
            iconWrapper.style.position = 'relative';

            const icon = document.createElement('div');
            icon.className = 'bm-folder-icon';

            const emptyFolderSVG = `
                <svg width="36" height="36" viewBox="0 0 491.52 491.52"
                <g>
                <path style="fill:#F6C358;" d="M445.522,88.989h-259.23c-5.832,0-11.24-3.318-14.26-8.749l-13.88-24.957
                c-3.021-5.432-8.427-8.749-14.259-8.749H45.998c-9.208,0-16.671,8.126-16.671,18.15v362.151c0,10.024,7.463,18.15,16.671,18.15
                h399.523c9.207,0,16.671-8.126,16.671-18.15V107.14C462.192,97.116,454.728,88.989,445.522,88.989z"/>
                <rect x="55.383" y="133.12" style="fill:#F6C358;" width="385.536" height="122.092"/>
                <rect x="55.383" y="150.17" style="fill:#F6C358;" width="385.536" height="122.092"/>
                <path style="fill:#FCD462;" d="M474.806,216.429H16.714c-10.557,0-17.956,8.348-16.541,18.538l27.158,195.639
                c1.107,7.974,9.46,14.379,18.667,14.379h399.523c9.207,0,17.56-6.405,18.667-14.379l27.158-195.639
                C492.761,224.777,485.362,216.429,474.806,216.429z"/>
                </g>
                </svg>
            `;

            const fullFolderSVG = `
                <svg width="36" height="36" viewBox="0 0 491.52 491.52"
                <g>
                <path style="fill:#F6C358;" d="M445.522,88.989h-259.23c-5.832,0-11.24-3.318-14.26-8.749l-13.88-24.957
                c-3.021-5.432-8.427-8.749-14.259-8.749H45.998c-9.208,0-16.671,8.126-16.671,18.15v362.151c0,10.024,7.463,18.15,16.671,18.15
                h399.523c9.207,0,16.671-8.126,16.671-18.15V107.14C462.192,97.116,454.728,88.989,445.522,88.989z"/>
                <rect x="55.383" y="133.12" style="fill:#EBF0F3;" width="385.536" height="122.092"/>
                <rect x="55.383" y="150.17" style="fill:#FFFFFF;" width="385.536" height="122.092"/>
                <path style="fill:#FCD462;" d="M474.806,216.429H16.714c-10.557,0-17.956,8.348-16.541,18.538l27.158,195.639
                c1.107,7.974,9.46,14.379,18.667,14.379h399.523c9.207,0,17.56-6.405,18.667-14.379l27.158-195.639
                C492.761,224.777,485.362,216.429,474.806,216.429z"/>
                </g>
                </svg>
            `;

            let isEmpty = true;
            if (typeof folder.barcodeCount === 'number') {
                isEmpty = folder.barcodeCount === 0;
            }
            // A folder also counts as non-empty when it contains sub-folders.
            if (getSubFolders(folder.name).length > 0) {
                isEmpty = false;
            }
            icon.innerHTML = isEmpty ? emptyFolderSVG : fullFolderSVG;

            const label = document.createElement('div');
            label.textContent = folder.pinned ? `📌 ${folder.name}` : `${folder.name}`;
            label.className = 'bm-text bm-folder-label';
            label.title = folder.name;

            iconWrapper.addEventListener('dblclick', () => {
                activeFolder = folder.name;
                renderFolders();
            });

            const menuIcon = document.createElement('div');
            menuIcon.textContent = '⋮';
            menuIcon.style.cursor = 'pointer';
            menuIcon.style.marginLeft = '8px';
            menuIcon.style.opacity = '0.6';
            menuIcon.style.fontSize = '18px';
            menuIcon.style.padding = '0 4px';
            menuIcon.className = 'bm-folder-menu-icon';

            menuIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                formWrapper.innerHTML = '';
                closeOpenFolderMenu();
                closeDropdown();

                closeAllContextMenus();
                if (folderMenu) {
                    folderMenu.remove();
                    folderMenu = null;
                    return;
                }
                folderMenu = buildContextMenu('bm-folder-menu-open');
                const closeFolderMenu = openContextMenuAtEvent(folderMenu, e, menuIcon, () => {
                    folderMenu = null;
                });

                const renameBtn = document.createElement('button');
                renameBtn.textContent = '✏️ Rename';
                renameBtn.className = 'bm-button';
                renameBtn.addEventListener('click', () => {
                    closeFolderMenu();
                    showRenameModal(folder.name, (newName) => {
                        if (newName && newName.trim() !== '' && newName.toLowerCase() !== folder.name.toLowerCase()) {
                            renameFolder(folder.name, newName);
                        } else if (newName !== null) {
                            showFlash('Invalid folder name', true, 'error');
                        }
                    });
                });

                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = '🗑️ Delete';
                deleteBtn.className = 'bm-button';
                deleteBtn.addEventListener('click', () => {
                    closeFolderMenu();
                    bmConfirm(`Are you sure you want to delete folder ${folder.name}?`, (result) => {
                        if (result) deleteFolder(folder.name);
                    });
                });

                const printBtn = document.createElement('button');
                printBtn.textContent = '🖨️ Print All';
                printBtn.className = 'bm-button';
                printBtn.addEventListener('click', () => {
                    closeFolderMenu();
                    (async () => {
                        const barcodes = await idbGetBarcodesByFolder(folder.name);
                        if (!barcodes || barcodes.length === 0) {
                            showFlash('Folder is empty', true, 'error');
                            return;
                        }

                        let successCount = 0;
                        let attemptedCount = 0;

                        for (const b of barcodes) {
                            const value = b?.value;
                            if (value == null || String(value).trim() === '') continue;
                            attemptedCount++;
                            const ok = await printBarcodeValue(value, b.format, 1, {
                                silent: true,
                                useRawText: true,
                                label: b?.name || ''
                            });
                            if (ok) successCount++;
                        }

                        if (attemptedCount === 0) {
                            showFlash('Nothing to print', true, 'error');
                            return;
                        }

                        const isError = successCount < attemptedCount;
                        const message = isError
                            ? `Print result: ${successCount}/${attemptedCount}`
                            : `Sent to printer: ${successCount}/${attemptedCount}`;
                        showFlash(message, isError, isError ? 'error' : 'success');
                    })();
                });

                const formatBtn = document.createElement('button');
                formatBtn.textContent = '🔁 Change Format';
                formatBtn.className = 'bm-button';
                formatBtn.addEventListener('click', () => {
                    closeFolderMenu();
                    showFolderChangeFormatModal(folder.name);
                });

                const moveBtn = document.createElement('button');
                moveBtn.textContent = '📂 Move';
                moveBtn.className = 'bm-button';
                moveBtn.addEventListener('click', () => {
                    closeFolderMenu();
                    showMoveModal('folder', folder.name, null);
                });

                const pinBtn = document.createElement('button');
                pinBtn.textContent = folder.pinned ? '📌 Unpin' : '📍 Pin';
                pinBtn.className = 'bm-button';
                pinBtn.addEventListener('click', () => {
                    updateFolder(folder.name, { pinned: !folder.pinned });
                    showFlash(folder.pinned ? 'Folder unpinned' : 'Folder pinned', false, 'success');
                    closeFolderMenu();
                });

                folderMenu.append(renameBtn, printBtn, formatBtn, moveBtn, deleteBtn, pinBtn);
            });

            iconWrapper.appendChild(icon);
            iconWrapper.appendChild(label);
            iconWrapper.appendChild(menuIcon);
            folderDisplay.appendChild(iconWrapper);
        });
    }

    // ============================================================
    // SECTION: Barcode Detail Modal and Print Preview
    // ------------------------------------------------------------
    // Large preview modal for QR, text labels, and linear barcodes.
    // It also exposes copy, save, print, and send-to-page actions.
    // ============================================================

    function showBigBarcodeModal(value, format, name, options = {}) {
        let oldModal = document.getElementById('bm-barcode-zoom-modal');
        if (oldModal) {
            if (oldModal._bmAutoCloseTimer) {
                clearTimeout(oldModal._bmAutoCloseTimer);
            }
            if (oldModal._bmAutoCloseInterval) {
                clearInterval(oldModal._bmAutoCloseInterval);
            }
            oldModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'bm-barcode-zoom-modal';
        Object.assign(modal.style, {
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            background: '#fff',
            border: '2px solid #d32f2f',
            borderRadius: '10px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            zIndex: 99999,
            padding: '12px',
            paddingBottom: '58px',
            width: '360px',
            height: '360px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            userSelect: 'none',
            gap: '6px',
            boxSizing: 'border-box'
        });

        let autoCloseTimer = null;
        let autoCloseInterval = null;
        const useModalAutoClose = false;
        const clearAutoClose = () => {
            if (autoCloseTimer) {
                clearTimeout(autoCloseTimer);
                autoCloseTimer = null;
            }
            if (autoCloseInterval) {
                clearInterval(autoCloseInterval);
                autoCloseInterval = null;
            }
        };
        const closeModal = () => {
            clearAutoClose();
            modal.remove();
            localStorage.removeItem(STORAGE_KEYS.BARCODE_MODAL);
            if (panel && panel.style.display !== 'none') {
                schedulePanelAutoClose();
            }
            if (closeModal._escHandler) {
                document.removeEventListener('keydown', closeModal._escHandler);
                closeModal._escHandler = null;
            }
        };
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeModal();
            }
        };
        closeModal._escHandler = escHandler;
        document.addEventListener('keydown', escHandler);
        const scheduleAutoClose = () => {
            if (!useModalAutoClose) return;
        };
        const resetAutoClose = () => {
            if (!useModalAutoClose) {
                resetModalAutoCloseOnActivity();
                return;
            }
            scheduleAutoClose();
        };

        const closeBtn = document.createElement('div');
        closeBtn.textContent = '✖';
        Object.assign(closeBtn.style, {
            position: 'absolute',
            top: '8px',
            right: '12px',
            color: '#fff',
            background: '#d32f2f',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '18px',
            lineHeight: '28px',
            padding: '0',
            textAlign: 'center',
            transform: 'translateX(-1px)',
            cursor: 'pointer',
            zIndex: 100001,
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
        });
        closeBtn.addEventListener('click', closeModal);
        modal.appendChild(closeBtn);

        const isLikelyURL = (val) => {
            return /^https?:\/\//i.test(val) ||
                /^www\.[\w\-]+\.[a-z]{2,}/i.test(val) ||
                /^[\w\-]+\.[a-z]{2,}(\/.*)?$/i.test(val);
        };

        const fmtUpper = String(format || '').toUpperCase();
        const isLinearFormat = !['TEXT', 'QR', '2D'].includes(fmtUpper);
        const preferLegacyLinearZoom = false;
        const shouldHideValueLabel = fmtUpper === 'EAN13';

        const holderHeight = 210;
        const holderWidth = 300;
        const holderPadding = 8;

        const topBar = document.createElement('div');
        Object.assign(topBar.style, {
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '6px',
            minHeight: '24px',
            position: 'relative'
        });

        const leftControls = document.createElement('div');
        Object.assign(leftControls.style, {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            minHeight: '24px'
        });

        let showPrintPreview = false;
        let previewToggle = null;
        let previewToggleWrap = null;
        if (String(format || '').toUpperCase() !== 'TEXT') {
            previewToggleWrap = document.createElement('label');
            previewToggleWrap.style.display = 'inline-flex';
            previewToggleWrap.style.alignItems = 'center';
            previewToggleWrap.style.gap = '6px';
            previewToggleWrap.style.fontSize = '12px';
            previewToggleWrap.style.color = '#444';

            previewToggle = document.createElement('input');
            previewToggle.type = 'checkbox';
            previewToggle.checked = false;
            previewToggle.className = 'bm-checkbox';
            previewToggleWrap.append(previewToggle, document.createTextNode('Print preview'));
            leftControls.appendChild(previewToggleWrap);
        }

        const rightSpacer = document.createElement('div');
        rightSpacer.style.width = '24px';

        topBar.append(leftControls, rightSpacer);
        modal.appendChild(topBar);

        const nameText = String(name || '').trim();
        if (nameText) {
            const nameLabel = document.createElement(isLikelyURL(value) ? 'a' : 'div');
            nameLabel.className = 'bm-header';
            nameLabel.textContent = nameText;
            Object.assign(nameLabel.style, {
                fontSize: '14px',
                color: '#333',
                textDecoration: 'none',
                textAlign: 'center',
                width: '100%',
                minWidth: '0',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                padding: '0 8px',
                marginTop: '2px'
            });

            if (isLikelyURL(value)) {
                let url = String(value);
                if (!/^https?:\/\//i.test(url)) {
                    url = 'https://' + url;
                }
                nameLabel.href = url;
                nameLabel.target = '_blank';
                nameLabel.style.color = '#1976d2';
                nameLabel.style.textDecoration = 'underline';
            }
            modal.appendChild(nameLabel);
        }

        const barcodeHolder = document.createElement('div');
        barcodeHolder.style.width = `${holderWidth}px`;
        barcodeHolder.style.height = `${holderHeight}px`;
        barcodeHolder.style.padding = `${holderPadding}px`;
        barcodeHolder.style.boxSizing = 'border-box';
        barcodeHolder.style.display = 'flex';
        barcodeHolder.style.alignItems = 'center';
        barcodeHolder.style.justifyContent = 'center';
        barcodeHolder.style.overflow = 'hidden';
        barcodeHolder.style.marginLeft = '24px';
        barcodeHolder.style.marginRight = '4px';
        modal.appendChild(barcodeHolder);

        let valueLabel = null;
        if (format !== 'TEXT' && !isLikelyURL(value)) {
            valueLabel = document.createElement('div');
            valueLabel.className = 'bm-text';
            valueLabel.textContent = String(value ?? '');
            Object.assign(valueLabel.style, {
                fontSize: '16px',
                fontWeight: '600',
                color: '#444',
                marginTop: '2px',
                textAlign: 'center',
                maxWidth: '420px',
                wordBreak: 'break-all',
                userSelect: 'text'
            });
            if (!shouldHideValueLabel) {
                modal.appendChild(valueLabel);
            }
        }

        let currentFormat = format;
        const originalLinearFormat = (format === 'QR' || format === '2D') ? 'CODE128' : format;

        let printPreviewCacheNode = null;
        let printPreviewCacheKey = '';

        const getPrintPreviewCacheKey = () => {
            return `${String(currentFormat || '')}|${String(value ?? '')}|${String(name ?? '')}`;
        };

        const normalizeJsBarcodeFormat = (fmt) => {
            const upper = String(fmt || '').toUpperCase();
            if (upper === 'ISBN') return 'EAN13';
            if (['B00', 'LPN', 'X00'].includes(upper)) return 'CODE128';
            return upper;
        };

        const estimateModules = (fmt, len) => {
            switch (String(fmt || '').toUpperCase()) {
                case 'EAN8':
                    return 67;
                case 'EAN13':
                case 'ISBN':
                case 'UPC':
                    return 95;
                case 'CODE39':
                    return (len * 16) + 10;
                case 'ITF':
                    return (len * 14) + 6;
                case 'CODABAR':
                    return (len * 16) + 10;
                case 'MSI':
                    return (len * 12) + 8;
                case 'PHARMACODE':
                    return 50 + (len * 4);
                case 'CODE128':
                default:
                    return (len * 11) + 35;
            }
        };

        const computeBarWidth = (fmt, valueLen, targetWidthPx, dpr = 1) => {
            const FIXED_BAR_WIDTH = 3.2 * dpr;
            const minBarWidth = 1 * dpr;
            return Math.max(minBarWidth, FIXED_BAR_WIDTH);
        };

        const renderLinearCanvas = (jsbFormat, holderWidthPx, holderHeightPx, opts = {}) => {
            const showDigits = !!opts.showDigits;
            const canvas = document.createElement('canvas');
            const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
            const displayWidth = Math.round(holderWidthPx * 0.9);
            const displayHeight = Math.round(holderHeightPx * (showDigits ? 0.58 : 0.45));
            const valueLen = Math.max(1, String(value ?? '').length);
            const barWidth = computeBarWidth(jsbFormat, valueLen, displayWidth, dpr);
            const modules = estimateModules(jsbFormat, valueLen);
            const contentWidthCss = Math.max(1, Math.round((modules * barWidth) / dpr));
            const canvasWidthCss = Math.min(displayWidth, contentWidthCss);
            const labelReserveCss = showDigits ? 22 : 6;
            const barHeight = Math.max(1, Math.round((displayHeight - labelReserveCss) * dpr));
            canvas.width = Math.round(canvasWidthCss * dpr);
            canvas.height = displayHeight * dpr;
            canvas.style.width = canvasWidthCss + 'px';
            canvas.style.height = displayHeight + 'px';
            canvas.style.imageRendering = 'pixelated';
            try {
                JsBarcode(canvas, value, {
                    format: jsbFormat,
                    lineColor: '#000',
                    width: barWidth,
                    height: barHeight,
                    displayValue: showDigits,
                    margin: showDigits ? 2 * dpr : 4 * dpr,
                    fontSize: showDigits ? 14 * dpr : 11 * dpr,
                    textMargin: showDigits ? 3 * dpr : 0
                });
                const ctx = canvas.getContext('2d');
                if (ctx) ctx.imageSmoothingEnabled = false;
            } catch (err) {
                canvas.style.display = 'none';
            }
            canvas.style.margin = '0';
            return canvas;
        };

        const renderLinearLabelPreview = (jsbFormat, renderBoxEl, opts = {}) => {
            const showDigits = !!opts.showDigits;
            const forceDigits = !!opts.forceDigits;
            const showValueLineInPreview = !!opts.showValueLineInPreview;
            const showBadgeLine = opts.showBadgeLine !== false;
            const labelPreview = document.createElement('div');
            Object.assign(labelPreview.style, {
                width: '100%',
                height: '100%',
                boxSizing: 'border-box',
                border: showPrintPreview ? 'none' : '1px dashed #bbb',
                padding: showPrintPreview ? '2mm 1mm 1mm 4mm' : '2mm 1mm 1mm 4mm',
                display: 'flex',
                flexDirection: 'column',
                alignItems: showPrintPreview ? 'flex-start' : 'flex-start',
                justifyContent: showPrintPreview ? 'flex-start' : 'flex-start',
                gap: showPrintPreview ? '0' : '0',
                textAlign: showPrintPreview ? 'left' : 'left',
                fontFamily: 'Arial, sans-serif'
            });
            if (showPrintPreview && showDigits) {
                labelPreview.style.overflow = 'visible';
                if (renderBoxEl) {
                    renderBoxEl.style.overflow = 'visible';
                }
            }

            const codeArea = document.createElement('div');
            Object.assign(codeArea.style, {
                width: showPrintPreview ? '45mm' : '37mm',
                height: showPrintPreview
                    ? (forceDigits ? '14mm' : '11mm')
                    : (showDigits ? '10mm' : '7.5mm'),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: showPrintPreview && showDigits ? 'visible' : 'hidden'
            });

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.style.width = 'auto';
            svg.style.height = '100%';
            svg.style.display = 'block';
            svg.style.overflow = 'hidden';
            codeArea.appendChild(svg);
            try {
                const displayValue = forceDigits || (!showPrintPreview && showDigits);
                if (!showPrintPreview && displayValue) {
                    codeArea.style.height = '10mm';
                }
                const mmToPx = (mm) => Math.round((mm * 96) / 25.4);
                const codeAreaWidthPx = mmToPx(showPrintPreview ? 45 : 37);
                const previewHeight = showPrintPreview
                    ? mmToPx(forceDigits ? 14 : 11)
                    : (displayValue ? 45 : 60);
                const valueLen = Math.max(1, String(value ?? '').length);
                const barWidth = computeBarWidth(jsbFormat, valueLen, codeAreaWidthPx, 1);
                const modules = estimateModules(jsbFormat, valueLen);
                const svgWidthPx = Math.round(modules * barWidth);
                JsBarcode(svg, value, {
                    format: jsbFormat,
                    lineColor: '#000',
                    width: barWidth,
                    height: previewHeight,
                    displayValue: displayValue,
                    margin: 0,
                    marginTop: 0,
                    marginBottom: 0,
                    marginLeft: 0,
                    marginRight: 0,
                    textAlign: 'left',
                    fontSize: displayValue ? (showPrintPreview ? 13 : 10) : undefined,
                    textMargin: displayValue ? (showPrintPreview ? 3 : 0) : undefined
                });
                svg.style.width = svgWidthPx + 'px';
                svg.style.maxWidth = '100%';
                svg.setAttribute('shape-rendering', 'crispEdges');
                if (showPrintPreview) {
                    svg.setAttribute('width', String(svgWidthPx));
                    svg.setAttribute('height', '100%');
                    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                    svg.setAttribute('shape-rendering', 'crispEdges');
                    svg.style.width = svgWidthPx + 'px';
                    svg.style.height = '100%';
                    svg.style.overflow = 'visible';
                }
            } catch (err) {
                svg.style.display = 'none';
            }

            const valueLine = document.createElement('div');
            valueLine.textContent = String(value ?? '');
            Object.assign(valueLine.style, {
                fontFamily: 'Courier New, monospace',
                fontSize: '3mm',
                fontWeight: '700',
                lineHeight: '1.1',
                marginTop: showPrintPreview ? '0.6mm' : '0.5mm',
                textAlign: 'left',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
                width: '100%',
                display: 'block',
                color: '#000'
            });

            let badgeLine = null;
            if (showBadgeLine) {
                const badgeId = (() => {
                    const match = document.cookie.match(/(?:^|; )fcmenu-employeeId=([^;]*)/);
                    const raw = match ? decodeURIComponent(match[1]) : '';
                    const trimmed = String(raw || '').trim();
                    return trimmed || '1';
                })();
                badgeLine = document.createElement('div');
                badgeLine.textContent = `(${badgeId})`;
                Object.assign(badgeLine.style, {
                    fontSize: '2mm',
                    fontWeight: '600',
                    lineHeight: '1.1',
                    marginTop: showPrintPreview ? '0.6mm' : '0.2mm',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                    width: '100%',
                    display: 'block',
                    color: '#000'
                });
            }

            const shouldShowValueLine = (!showPrintPreview && !forceDigits) || (showPrintPreview && showValueLineInPreview);
            if (!showPrintPreview) {
                const titleLine = document.createElement('div');
                titleLine.textContent = String(name || '');
                Object.assign(titleLine.style, {
                    fontSize: '2.7mm',
                    lineHeight: '1.1',
                    marginTop: '0.2mm',
                    textAlign: 'left',
                    whiteSpace: 'pre-line',
                    overflow: 'hidden'
                });
                if (shouldShowValueLine) {
                    if (badgeLine) {
                        labelPreview.append(codeArea, valueLine, badgeLine, titleLine);
                    } else {
                        labelPreview.append(codeArea, valueLine, titleLine);
                    }
                } else if (badgeLine) {
                    labelPreview.append(codeArea, badgeLine, titleLine);
                } else {
                    labelPreview.append(codeArea, titleLine);
                }
            } else {
                if (shouldShowValueLine && badgeLine) {
                    labelPreview.append(codeArea, valueLine, badgeLine);
                } else if (shouldShowValueLine) {
                    labelPreview.append(codeArea, valueLine);
                } else if (badgeLine) {
                    labelPreview.append(codeArea, badgeLine);
                } else {
                    labelPreview.append(codeArea);
                }
            }
            return labelPreview;
        };

        const renderCode128 = (holderWidthPx, holderHeightPx, renderBoxEl) => {
            const jsbFormat = 'CODE128';
            if (!showPrintPreview) {
                return renderLinearCanvas(jsbFormat, holderWidthPx, holderHeightPx, { showDigits: false });
            }
            return renderLinearLabelPreview(jsbFormat, renderBoxEl, {
                showDigits: false,
                forceDigits: false,
                showValueLineInPreview: true,
                showBadgeLine: true
            });
        };

        const renderEan13 = (holderWidthPx, holderHeightPx, renderBoxEl) => {
            const jsbFormat = 'EAN13';
            if (!showPrintPreview) {
                return renderLinearCanvas(jsbFormat, holderWidthPx, holderHeightPx, { showDigits: true });
            }
            return renderLinearLabelPreview(jsbFormat, renderBoxEl, { showDigits: true, forceDigits: true, showBadgeLine: true });
        };

        const renderEan8 = (holderWidthPx, holderHeightPx, renderBoxEl) => {
            const jsbFormat = 'EAN8';
            if (!showPrintPreview) {
                return renderLinearCanvas(jsbFormat, holderWidthPx, holderHeightPx, { showDigits: true });
            }
            return renderLinearLabelPreview(jsbFormat, renderBoxEl, { showDigits: true, forceDigits: true, showBadgeLine: true });
        };

        const renderUpc = (holderWidthPx, holderHeightPx, renderBoxEl) => {
            const jsbFormat = 'UPC';
            if (!showPrintPreview) {
                return renderLinearCanvas(jsbFormat, holderWidthPx, holderHeightPx, { showDigits: true });
            }
            return renderLinearLabelPreview(jsbFormat, renderBoxEl, { showDigits: true, forceDigits: true, showBadgeLine: true });
        };

        const renderIsbn = (holderWidthPx, holderHeightPx, renderBoxEl) => {
            const jsbFormat = 'EAN13';
            if (!showPrintPreview) {
                return renderLinearCanvas(jsbFormat, holderWidthPx, holderHeightPx, { showDigits: true });
            }
            return renderLinearLabelPreview(jsbFormat, renderBoxEl, { showDigits: true, forceDigits: true, showBadgeLine: true });
        };

        const renderItf = (holderWidthPx, holderHeightPx, renderBoxEl) => {
            const jsbFormat = 'ITF';
            if (!showPrintPreview) {
                return renderLinearCanvas(jsbFormat, holderWidthPx, holderHeightPx, { showDigits: false });
            }
            return renderLinearLabelPreview(jsbFormat, renderBoxEl, { showDigits: false, forceDigits: false, showBadgeLine: true });
        };

        const renderCodabar = (holderWidthPx, holderHeightPx, renderBoxEl) => {
            const jsbFormat = 'CODABAR';
            if (!showPrintPreview) {
                return renderLinearCanvas(jsbFormat, holderWidthPx, holderHeightPx, { showDigits: false });
            }
            return renderLinearLabelPreview(jsbFormat, renderBoxEl, { showDigits: false, forceDigits: false, showBadgeLine: true });
        };

        const renderLinearByFormat = (holderWidthPx, holderHeightPx, renderBoxEl) => {
            const fmtKey = String(currentFormat || '').toUpperCase();
            switch (fmtKey) {
                case 'EAN13':
                    return renderEan13(holderWidthPx, holderHeightPx, renderBoxEl);
                case 'EAN8':
                    return renderEan8(holderWidthPx, holderHeightPx, renderBoxEl);
                case 'UPC':
                    return renderUpc(holderWidthPx, holderHeightPx, renderBoxEl);
                case 'ISBN':
                    return renderIsbn(holderWidthPx, holderHeightPx, renderBoxEl);
                case 'ITF':
                    return renderItf(holderWidthPx, holderHeightPx, renderBoxEl);
                case 'CODABAR':
                    return renderCodabar(holderWidthPx, holderHeightPx, renderBoxEl);
                case 'B00':
                case 'LPN':
                case 'X00':
                    return renderCode128(holderWidthPx, holderHeightPx, renderBoxEl);
                case 'CODE128':
                default:
                    return renderCode128(holderWidthPx, holderHeightPx, renderBoxEl);
            }
        };

        const renderBigBarcode = () => {
            if (valueLabel) {
                valueLabel.style.display = (showPrintPreview || shouldHideValueLabel) ? 'none' : 'block';
            }
            barcodeHolder.innerHTML = '';
            const renderBox = document.createElement('div');
            Object.assign(renderBox.style, {
                width: '100%',
                height: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
            });
            if (showPrintPreview) {
                renderBox.style.width = '50.8mm';
                renderBox.style.height = '31.75mm';
                renderBox.style.border = '2px dashed #bbb';
            }
            barcodeHolder.appendChild(renderBox);
            const holderRect = renderBox.getBoundingClientRect();
            const effectiveHolderWidth = holderRect?.width || holderWidth;
            const effectiveHolderHeight = holderRect?.height || holderHeight;
            let bigBarcode;
            if (showPrintPreview && printPreviewCacheNode && printPreviewCacheKey === getPrintPreviewCacheKey()) {
                renderBox.appendChild(printPreviewCacheNode.cloneNode(true));
                return;
            }
            if (currentFormat === 'TEXT') {
                const textBlock = document.createElement('pre');
                textBlock.className = 'bm-modal-scroll';
                textBlock.textContent = String(value ?? '');
                Object.assign(textBlock.style, {
                    margin: '0',
                    padding: '8px',
                    border: '1px dashed #bbb',
                    borderRadius: '6px',
                    width: '100%',
                    height: '100%',
                    overflow: 'auto',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    whiteSpace: 'pre-wrap',
                    background: '#fff',
                    color: '#000',
                    boxSizing: 'border-box'
                });
                textBlock.style.lineHeight = '1.2';
                requestAnimationFrame(() => {
                    addTextPageDividers(textBlock, 12 * 1.2, TEXT_LINES_PER_PAGE, '#999');
                });
                bigBarcode = textBlock;
            } else if (currentFormat === 'QR' || currentFormat === '2D') {
                const qrSize = showPrintPreview
                    ? Math.round(effectiveHolderHeight * 0.6)
                    : Math.round(effectiveHolderHeight * 0.82);

                const canvas = document.createElement('canvas');
                canvas.width = qrSize;
                canvas.height = qrSize;
                try {
                    if (typeof QRCode !== 'undefined' && QRCode.toCanvas) {
                        QRCode.toCanvas(canvas, String(value || ''), { margin: 0, width: qrSize }, function () { });
                    }
                } catch (err) {
                    canvas.style.display = 'none';
                }
                canvas.style.width = qrSize + 'px';
                canvas.style.height = qrSize + 'px';
                canvas.style.display = 'block';

                if (showPrintPreview) {
                    const badgeId = (() => {
                        const match = document.cookie.match(/(?:^|; )fcmenu-employeeId=([^;]*)/);
                        const raw = match ? decodeURIComponent(match[1]) : '';
                        const trimmed = String(raw || '').trim();
                        return trimmed || '1';
                    })();
                    const wrapper = document.createElement('div');
                    Object.assign(wrapper.style, {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '2mm',
                        width: '100%'
                    });
                    const badgeLine = document.createElement('div');
                    badgeLine.textContent = `(${badgeId})`;
                    Object.assign(badgeLine.style, {
                        fontSize: '2mm',
                        fontWeight: '600',
                        lineHeight: '1',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        color: '#000'
                    });
                    wrapper.append(canvas, badgeLine);
                    bigBarcode = wrapper;
                } else {
                    bigBarcode = canvas;
                }
            } else {
                if (preferLegacyLinearZoom) {
                    const canvas = document.createElement('canvas');
                    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
                    const displayWidth = Math.round(effectiveHolderWidth * 0.9);
                    const displayHeight = Math.round(effectiveHolderHeight * 0.45);
                    canvas.width = displayWidth * dpr;
                    canvas.height = displayHeight * dpr;
                    canvas.style.width = displayWidth + 'px';
                    canvas.style.height = displayHeight + 'px';
                    try {
                        let jsbFormat = normalizeJsBarcodeFormat(currentFormat);
                        JsBarcode(canvas, value, {
                            format: jsbFormat,
                            lineColor: '#000',
                            width: 2 * dpr,
                            height: 96 * dpr,
                            displayValue: false,
                            margin: 3 * dpr
                        });
                        const ctx = canvas.getContext('2d');
                        if (ctx) ctx.imageSmoothingEnabled = false;
                    } catch (err) {
                        canvas.style.display = 'none';
                    }
                    bigBarcode = canvas;
                    bigBarcode.style.margin = '0';
                } else {
                    bigBarcode = renderLinearByFormat(effectiveHolderWidth, effectiveHolderHeight, renderBox);
                }
            }
            renderBox.appendChild(bigBarcode);
            if (showPrintPreview && bigBarcode) {
                printPreviewCacheNode = bigBarcode.cloneNode(true);
                printPreviewCacheKey = getPrintPreviewCacheKey();
            }
        };

        if (previewToggle) {
            previewToggle.addEventListener('change', () => {
                showPrintPreview = !!previewToggle.checked;
                if (showPrintPreview) {
                    printPreviewCacheNode = null;
                    printPreviewCacheKey = '';
                }
                renderBigBarcode();
            });
        }
        renderBigBarcode();

        if (format !== 'TEXT') {
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.title = 'Toggle QR/Linear';
            toggleBtn.innerHTML = '🔁';
            Object.assign(toggleBtn.style, {
                position: 'absolute',
                left: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: '1px solid #ccc',
                background: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                zIndex: 100002,
                fontSize: '16px'
            });
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (currentFormat === 'QR' || currentFormat === '2D') {
                    currentFormat = originalLinearFormat;
                } else {
                    currentFormat = 'QR';
                }
                renderBigBarcode();
            });
            modal.appendChild(toggleBtn);
        }

        const actions = document.createElement('div');
        actions.className = 'bm-modal-actions';
        Object.assign(actions.style, {
            width: '100%',
            justifyContent: 'center',
            flexWrap: 'wrap',
            position: 'absolute',
            left: '0',
            right: '0',
            bottom: '8px',
            padding: '0 8px',
            boxSizing: 'border-box'
        });

        const copyBtn = document.createElement('button');
        copyBtn.className = 'bm-modal-action-btn';
        copyBtn.textContent = '📝';
        copyBtn.title = 'Copy';
        copyBtn.addEventListener('click', () => runActionWithFeedback(copyBtn, () => copyToClipboard(value)));

        const printCopiesInput = createPrintCopiesInput();

        let quickFolderSelect = null;
        let quickFolderInput = null;
        let quickFolderMode = 'select';
        let quickFolderContainer = null;
        if (options?.fromShortcut) {
            quickFolderContainer = document.createElement('div');
            Object.assign(quickFolderContainer.style, {
                display: 'inline-flex',
                alignItems: 'center'
            });

            quickFolderSelect = createFolderDestinationSelect(activeFolder || 'Default', activeSubFolder || '', {
                fontSize: '12px',
                padding: '4px 6px',
                height: '28px',
                minWidth: '90px',
                maxWidth: '140px',
                width: '140px',
                flex: '0 1 auto'
            });

            quickFolderInput = document.createElement('input');
            quickFolderInput.className = 'bm-input';
            quickFolderInput.placeholder = 'New folder name';
            quickFolderInput.style.fontSize = '12px';
            quickFolderInput.style.padding = '4px 6px';
            quickFolderInput.style.height = '28px';
            quickFolderInput.style.minWidth = '90px';
            quickFolderInput.style.maxWidth = '120px';
            quickFolderInput.style.width = '120px';
            quickFolderInput.style.flex = '0 1 auto';
            quickFolderInput.style.display = 'none';

            const swapToNewFolder = () => {
                quickFolderMode = 'new';
                quickFolderSelect.style.display = 'none';
                quickFolderInput.style.display = 'inline-flex';
                saveBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" style="display:block; width:16px; height:16px; transform:scale(1.875); transform-origin:center;" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="#00ce00" aria-hidden="true" focusable="false"><g stroke-width="0"></g><g stroke-linecap="round" stroke-linejoin="round"></g><g> <path d="M8 12.5L10.5 15L16 9M7.2 20H16.8C17.9201 20 18.4802 20 18.908 19.782C19.2843 19.5903 19.5903 19.2843 19.782 18.908C20 18.4802 20 17.9201 20 16.8V7.2C20 6.0799 20 5.51984 19.782 5.09202C19.5903 4.71569 19.2843 4.40973 18.908 4.21799C18.4802 4 17.9201 4 16.8 4H7.2C6.0799 4 5.51984 4 5.09202 4.21799C4.71569 4.40973 4.40973 4.71569 4.21799 5.09202C4 5.51984 4 6.07989 4 7.2V16.8C4 17.9201 4 18.4802 4.21799 18.908C4.40973 19.2843 4.71569 19.5903 5.09202 19.782C5.51984 20 6.07989 20 7.2 20Z" stroke="#00a800" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path> </g></svg>';
                saveBtn.style.backgroundColor = '';
                saveBtn.style.color = '';
                saveBtn.style.fontSize = '';
                saveBtn.style.minWidth = '';
                saveBtn.style.height = '';
                saveBtn.style.padding = '4px 8px';
                saveBtn.style.borderRadius = '6px';
                saveBtn.style.display = 'inline-flex';
                saveBtn.style.alignItems = 'center';
                saveBtn.style.justifyContent = 'center';
                saveBtn.style.boxSizing = 'border-box';
                saveBtn.style.lineHeight = '';
                quickFolderInput.focus();
            };

            const swapToSelect = () => {
                quickFolderMode = 'select';
                quickFolderInput.value = '';
                quickFolderInput.style.display = 'none';
                quickFolderSelect.style.display = '';
                saveBtn.textContent = '💾';
                saveBtn.style.backgroundColor = '';
                saveBtn.style.color = '';
                saveBtn.style.fontSize = '';
                saveBtn.style.minWidth = '';
                saveBtn.style.height = '';
                saveBtn.style.padding = '';
                saveBtn.style.borderRadius = '';
                saveBtn.style.display = '';
                saveBtn.style.alignItems = '';
                saveBtn.style.justifyContent = '';
                saveBtn.style.boxSizing = '';
                saveBtn.style.lineHeight = '';
            };

            quickFolderSelect.addEventListener('change', () => {
                if (quickFolderSelect.value !== '__NEW__') {
                    quickFolderSelect.dataset.lastValid = quickFolderSelect.value;
                    return;
                }
                const lastValid = quickFolderSelect.dataset.lastValid || (activeFolder || 'Default');
                quickFolderSelect.value = lastValid;
                swapToNewFolder();
            });

            quickFolderInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    swapToSelect();
                }
                if (e.key === 'Enter') {
                    saveBtn.click();
                }
            });

            quickFolderContainer.append(quickFolderSelect, quickFolderInput);
        }

        const saveBtn = document.createElement('button');
        saveBtn.className = 'bm-modal-action-btn';
        if (options?.fromShortcut) {
            saveBtn.textContent = '💾';
            saveBtn.title = 'Save to folder';
            saveBtn.addEventListener('click', () => runActionWithFeedback(saveBtn, async () => {
                const saveValue = String(value ?? '').trim();
                if (!saveValue) {
                    showFlash('Value is empty', true, 'error');
                    return false;
                }

                let { folder, subfolder } = getSelectedFolderDestination(quickFolderSelect, 'Default');
                if (quickFolderMode === 'new') {
                    const newName = String(quickFolderInput.value || '').trim();
                    if (!newName) {
                        showFlash('Folder name cannot be empty', true, 'error');
                        return false;
                    }
                    await saveFolder(newName);
                    await populateFolderTreeSelect(quickFolderSelect, newName, '');
                    folder = newName;
                    subfolder = '';
                }

                const saveFormat = normalizeBarcodeFormatInput(currentFormat);
                const smartName = await generateSmartBarcodeName(saveValue, saveFormat, folder);
                await idbAddBarcode({ name: smartName, value: saveValue, format: saveFormat, folder, subfolder, pinned: false });
                activeFolder = folder || null;
                activeSubFolder = subfolder || null;
                renderFolders();
                showFlash('Saved to folder', false, 'success');
                closeModal();
                return true;
            }));
        } else {
            saveBtn.textContent = '💾';
            saveBtn.title = 'Save to folder';
            saveBtn.addEventListener('click', () => runActionWithFeedback(saveBtn, async () => {
                const saveValue = String(value ?? '').trim();
                if (!saveValue) {
                    showFlash('Value is empty', true, 'error');
                    return false;
                }

                const saveModal = document.createElement('div');
                saveModal.className = 'bm-modal';
                saveModal.dataset.noAutoclose = '1';
                Object.assign(saveModal.style, {
                    position: 'fixed',
                    padding: '12px',
                    minWidth: '240px',
                    zIndex: '100003'
                });

                const header = document.createElement('div');
                header.className = 'bm-header';
                header.textContent = 'Save to folder';
                header.style.fontSize = '13px';
                header.style.marginBottom = '6px';

                const folderRow = document.createElement('div');
                Object.assign(folderRow.style, {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '8px'
                });

                const folderLabel = document.createElement('div');
                folderLabel.className = 'bm-text';
                folderLabel.textContent = 'Folder';
                folderLabel.style.fontSize = '12px';

                const folderSelect = createFolderDestinationSelect(activeFolder || 'Default', activeSubFolder || '', {
                    fontSize: '12px',
                    padding: '4px 6px',
                    height: '28px',
                    flex: '1',
                    minWidth: '0'
                });
                const newFolderRow = document.createElement('div');
                Object.assign(newFolderRow.style, {
                    display: 'none',
                    alignItems: 'center',
                    gap: '6px',
                    marginTop: '6px'
                });

                const newFolderInput = document.createElement('input');
                newFolderInput.className = 'bm-input';
                newFolderInput.placeholder = 'New folder name';
                newFolderInput.style.flex = '1';

                const newFolderCreateBtn = document.createElement('button');
                newFolderCreateBtn.className = 'bm-button';
                newFolderCreateBtn.textContent = 'Create';

                newFolderRow.append(newFolderInput, newFolderCreateBtn);

                let okBtn = null;

                const showNewFolderRow = () => {
                    newFolderRow.style.display = 'flex';
                    okBtn.disabled = true;
                    okBtn.style.opacity = '0.6';
                    newFolderInput.focus();
                };

                const hideNewFolderRow = () => {
                    newFolderRow.style.display = 'none';
                    okBtn.disabled = false;
                    okBtn.style.opacity = '';
                };

                folderSelect.addEventListener('change', () => {
                    if (folderSelect.value !== '__NEW__') {
                        folderSelect.dataset.lastValid = folderSelect.value;
                        hideNewFolderRow();
                        return;
                    }
                    showNewFolderRow();
                });

                newFolderCreateBtn.addEventListener('click', async () => {
                    const newName = String(newFolderInput.value || '').trim();
                    if (!newName) {
                        showFlash('Folder name cannot be empty', true, 'error');
                        return;
                    }
                    await saveFolder(newName);
                    await populateFolderTreeSelect(folderSelect, newName, '');
                    hideNewFolderRow();
                    newFolderInput.value = '';
                });
                folderRow.append(folderLabel, folderSelect);

                const btnRow = document.createElement('div');
                Object.assign(btnRow.style, {
                    display: 'flex',
                    gap: '8px',
                    justifyContent: 'center'
                });

                okBtn = document.createElement('button');
                okBtn.className = 'bm-button';
                okBtn.textContent = 'Save';
                okBtn.addEventListener('click', async () => {
                    const { folder, subfolder } = getSelectedFolderDestination(folderSelect, 'Default');
                    const saveFormat = normalizeBarcodeFormatInput(currentFormat);
                    await idbAddBarcode({ name: saveValue, value: saveValue, format: saveFormat, folder, subfolder, pinned: false });
                    activeFolder = folder || null;
                    activeSubFolder = subfolder || null;
                    renderFolders();
                    showFlash('Saved to folder', false, 'success');
                    saveModal.remove();
                });

                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'bm-button';
                cancelBtn.textContent = 'Cancel';
                cancelBtn.addEventListener('click', () => saveModal.remove());

                btnRow.append(okBtn, cancelBtn);
                saveModal.append(header, folderRow, newFolderRow, btnRow);
                document.body.appendChild(saveModal);
                wireModalIdleTracking(saveModal);

                saveModal.tabIndex = -1;
                saveModal.focus();
                saveModal.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        saveModal.remove();
                    }
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        okBtn.click();
                    }
                });

                return true;
            }));
        }

        const printBtn = document.createElement('button');
        printBtn.className = 'bm-modal-action-btn';
        printBtn.textContent = '🖨️';
        printBtn.title = 'Print';
        printBtn.addEventListener('click', () => runActionWithFeedback(printBtn, () => {
            const copies = getPrintCopies(printCopiesInput);
            const label = options?.suppressLabel ? '' : (name || '');
            return printBarcodeValue(value, currentFormat, copies, { label });
        }));

        if (format !== 'TEXT') {
            const sendBtn = document.createElement('button');
            sendBtn.className = 'bm-modal-action-btn';
            sendBtn.title = '📤 Sends value like scanner input';
            sendBtn.style.display = 'inline-flex';
            sendBtn.style.alignItems = 'center';
            sendBtn.style.justifyContent = 'center';
            sendBtn.style.gap = '6px';
            sendBtn.style.whiteSpace = 'nowrap';

            const sendIcon = document.createElement('span');
            sendIcon.textContent = '📤';

            const sendText = document.createElement('span');
            sendText.textContent = 'Send like scanner';
            sendText.style.fontSize = '0.7em';

            sendBtn.append(sendIcon, sendText);
            sendBtn.addEventListener('click', () => {
                const originalIcon = sendIcon.textContent;
                const originalColor = sendIcon.style.color;

                Promise.resolve()
                    .then(() => sendValueToPage(value))
                    .then((ok) => {
                        if (ok !== false) {
                            sendIcon.textContent = '✅';
                            sendIcon.style.color = '#2e7d32';
                            setTimeout(() => {
                                sendIcon.textContent = originalIcon;
                                sendIcon.style.color = originalColor;
                            }, 1200);
                        } else {
                            sendIcon.textContent = '❌';
                            sendIcon.style.color = '#c62828';
                            setTimeout(() => {
                                sendIcon.textContent = originalIcon;
                                sendIcon.style.color = originalColor;
                            }, 1200);
                        }
                    })
                    .catch(() => {
                        sendIcon.textContent = '❌';
                        sendIcon.style.color = '#c62828';
                        setTimeout(() => {
                            sendIcon.textContent = originalIcon;
                            sendIcon.style.color = originalColor;
                        }, 1200);
                    });
            });
            if (options?.fromShortcut) {
                actions.append(copyBtn, quickFolderContainer, saveBtn, printBtn, printCopiesInput);
            } else {
                actions.append(copyBtn, sendBtn, printBtn, printCopiesInput);
            }
        } else {
            if (options?.fromShortcut) {
                actions.append(copyBtn, quickFolderContainer, saveBtn, printBtn, printCopiesInput);
            } else {
                actions.append(copyBtn, printBtn, printCopiesInput);
            }
        }
        modal.appendChild(actions);

        let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
        modal.addEventListener('mousedown', function (e) {
            if (e.target === closeBtn) return;
            isDragging = true;
            dragOffsetX = e.clientX - modal.getBoundingClientRect().left;
            dragOffsetY = e.clientY - modal.getBoundingClientRect().top;
            document.body.style.userSelect = 'none';
        });
        document.addEventListener('mousemove', function (e) {
            if (!isDragging) return;
            modal.style.left = (e.clientX - dragOffsetX) + 'px';
            modal.style.top = (e.clientY - dragOffsetY) + 'px';
            modal.style.transform = 'none';
        });
        document.addEventListener('mouseup', function () {
            isDragging = false;
            document.body.style.userSelect = '';
        });

        document.body.appendChild(modal);
        wireModalIdleTracking(modal);

        const resetAutoCloseOnActivity = () => {
            resetAutoClose();
        };
        ['mousedown', 'keydown', 'input', 'focusin', 'wheel', 'touchstart', 'mousemove'].forEach((evt) => {
            modal.addEventListener(evt, resetAutoCloseOnActivity, { passive: true });
        });
        resetAutoClose();
        modal._bmAutoCloseTimer = autoCloseTimer;
        modal._bmAutoCloseInterval = autoCloseInterval;

    }

    // ============================================================
    // SECTION: Runtime Synchronization and Bootstrap
    // ------------------------------------------------------------
    // Cross-tab sync, startup render, DOM attach, and footer wiring.
    // Keep this near the end so all referenced functions exist.
    // ============================================================

    StorageService.registerRuntimeSync({ renderFolders, renderNotes, updateFooterCount, scheduleQrPreviewPrefetch });

    async function initialize() {
        const folders = await getFolders();
        const subfolders = getAllSubFolders();
        const barcodes = await getBarcodes();
        if (flattenDeepHierarchy(folders, subfolders, barcodes)) {
            StorageService.gmSet(STORAGE_KEYS.SUBFOLDERS, subfolders);
            StorageService.gmSet(STORAGE_KEYS.BARCODES, barcodes);
        }

        const bFolders = getBookmarkFolders();
        const bSubfolders = getAllBookmarkSubFolders();
        const bookmarks = getBookmarks();
        if (flattenDeepHierarchy(bFolders, bSubfolders, bookmarks)) {
            saveBookmarkSubFolders(bSubfolders);
            saveBookmarks(bookmarks);
        }

        await renderFolders();
        document.body.appendChild(panel);
        floatingButton.addEventListener('click', togglePanel);
        // Keep panel closed by default
        panel.style.display = 'none';
        if (WorkspaceService.isSupported()) {
            WorkspaceService.initialize()
                .catch(err => WorkspaceDiagnostics.warn('Workspace startup initialization failed.', err));
        }
        initReminderChecker();
    }

    document.addEventListener('DOMContentLoaded', function () {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEYS.BARCODE_MODAL) || '{}');
        if (data.open && data.value && data.format) {
            showBigBarcodeModal(data.value, data.format, data.name);
        }
    });



    // ============================================================
    // SECTION: Footer, Action Dropdown, and About Modal
    // ------------------------------------------------------------
    // Controls appended after initialize is declared but before the
    // final initialize() call. They close over panel/footer state.
    // ============================================================

    // Create dropdown menu for hamburger button
    const dropdown = document.createElement('div');
    dropdown.className = 'bm-menu';
    dropdown.style.display = 'none';
    dropdown.style.position = 'absolute';
    dropdown.style.zIndex = 10001;
    dropdown.style.flexDirection = 'row';
    dropdown.style.alignItems = 'center';
    dropdown.style.gap = '10px';
    dropdown.style.padding = '8px';
    dropdown.style.minWidth = 'unset';
    dropdown.style.borderRadius = '10px';
    dropdown.style.background = '#fff';

    const createMenuIconButton = (labelText, iconHtml) => {
        const btn = document.createElement('button');
        btn.className = 'bm-button';
        Object.assign(btn.style, {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '6px 8px',
            minWidth: '64px',
            textAlign: 'center',
            background: '#f7f7f7',
            border: 'none',
            borderRadius: '8px'
        });

        const iconWrap = document.createElement('div');
        iconWrap.innerHTML = iconHtml;
        iconWrap.style.display = 'flex';
        iconWrap.style.alignItems = 'center';
        iconWrap.style.justifyContent = 'center';
        iconWrap.style.width = '28px';
        iconWrap.style.height = '28px';

        const label = document.createElement('div');
        label.className = 'bm-text';
        label.textContent = labelText;
        label.style.fontSize = '11px';
        label.style.color = '#333';
        label.style.whiteSpace = 'nowrap';

        btn.append(iconWrap, label);
        return btn;
    };

    const folderIconSvg = `
            <svg width="24" height="24" viewBox="0 0 491.52 491.52">
                <g>
                    <path style="fill:#F6C358;" d="M445.522,88.989h-259.23c-5.832,0-11.24-3.318-14.26-8.749l-13.88-24.957
                    c-3.021-5.432-8.427-8.749-14.259-8.749H45.998c-9.208,0-16.671,8.126-16.671,18.15v362.151c0,10.024,7.463,18.15,16.671,18.15
                    h399.523c9.207,0,16.671-8.126,16.671-18.15V107.14C462.192,97.116,454.728,88.989,445.522,88.989z"/>
                    <rect x="55.383" y="133.12" style="fill:#F6C358;" width="385.536" height="122.092"/>
                    <rect x="55.383" y="150.17" style="fill:#F6C358;" width="385.536" height="122.092"/>
                    <path style="fill:#FCD462;" d="M474.806,216.429H16.714c-10.557,0-17.956,8.348-16.541,18.538l27.158,195.639
                    c1.107,7.974,9.46,14.379,18.667,14.379h399.523c9.207,0,17.56-6.405,18.667-14.379l27.158-195.639
                    C492.761,224.777,485.362,216.429,474.806,216.429z"/>
                </g>
            </svg>
        `;

    const barcodeIconSvg = `
            <svg width="28" height="16" viewBox="0 0 32 18">
                <rect x="0" y="0" width="2" height="18" fill="#222"/>
                <rect x="4" y="0" width="1" height="18" fill="#222"/>
                <rect x="7" y="0" width="2" height="18" fill="#222"/>
                <rect x="11" y="0" width="1" height="18" fill="#222"/>
                <rect x="14" y="0" width="3" height="18" fill="#222"/>
                <rect x="19" y="0" width="1" height="18" fill="#222"/>
                <rect x="22" y="0" width="2" height="18" fill="#222"/>
                <rect x="26" y="0" width="1" height="18" fill="#222"/>
                <rect x="29" y="0" width="2" height="18" fill="#222"/>
            </svg>
        `;

    const textLabelIconSvg = `
            <svg width="28" height="20" viewBox="0 0 24 24">
                <path fill="#4a4a4a" d="M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 5h12v2H6V8zm0 4h12v2H6v-2zm0 4h8v2H6v-2z"/>
            </svg>
        `;

    const bookmarkIconSvg = `
            <svg width="24" height="24" viewBox="0 0 24 24">
                <path fill="#1976d2" d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>
                <path fill="#ffffff" d="M8 6h8v2H8V6zm0 4h8v2H8v-2z" opacity="0.85"/>
            </svg>
        `;

    // Menu options
    const addFolderBtn = createMenuIconButton('New Folder', folderIconSvg);
    addFolderBtn.onclick = function (e) {
        e.stopPropagation();
        dropdown.style.display = 'none';
        if (currentTabName === 'bookmarks') {
            showBookmarkFolderForm();
            return;
        }
        if (currentTabName === 'notes') {
            showNewFolderModal(async (name) => {
                if (!name) return;
                const ok = NoteService.createNoteFolder(name);
                if (!ok) return;
                activeNoteFolder = name;
                await renderNotes();
            });
            return;
        }
        switchTab('barcode');
        showFolderForm();
    };

    const addBarcodeBtn = createMenuIconButton('New Barcode', barcodeIconSvg);
    addBarcodeBtn.onclick = function (e) {
        e.stopPropagation();
        dropdown.style.display = 'none';
        showBarcodeForm();
    };

    const printTextBtn = createMenuIconButton('Text Label', textLabelIconSvg);
    printTextBtn.onclick = function (e) {
        e.stopPropagation();
        dropdown.style.display = 'none';
        showTextPrintModal();
    };

    const addBookmarkBtn = createMenuIconButton('Bookmark', bookmarkIconSvg);
    addBookmarkBtn.onclick = function (e) {
        e.stopPropagation();
        dropdown.style.display = 'none';
        switchTab('bookmarks');
        showBookmarkForm();
    };

    const noteIconSvg = `
            <svg width="24" height="24" viewBox="0 0 24 24">
                <path fill="#6a5acd" d="M6 3h10l3 3v15H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
                <path fill="#ffffff" d="M8 8h8v1.5H8V8zm0 4h8v1.5H8V12zm0 4h5v1.5H8V16z" opacity="0.9"/>
            </svg>
        `;

    const addNoteBtn = createMenuIconButton('Note', noteIconSvg);
    addNoteBtn.onclick = function (e) {
        e.stopPropagation();
        dropdown.style.display = 'none';
        switchTab('notes');
        showNoteEditor();
    };

    dropdown.appendChild(addFolderBtn);
    dropdown.appendChild(addBarcodeBtn);
    dropdown.appendChild(printTextBtn);
    dropdown.appendChild(addBookmarkBtn);
    dropdown.appendChild(addNoteBtn);

    // Add dropdown to panel
    panel.appendChild(dropdown);

    // --- Footer 3 columns ---
    const footer = document.createElement('div');
    footer.className = 'bm-footer';
    Object.assign(footer.style, {
        width: '100%',
        borderTop: '1px solid #e0e0e0',
        background: '#f5f5f5',
        fontSize: '13px',
        marginTop: '0',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: '28px',
        justifyContent: 'space-between',
        flex: '0 0 auto', // do not grow/shrink
        position: 'relative',
        zIndex: 1,
    });

    // Left column: item count
    const footerLeft = document.createElement('div');
    footerLeft.style.flex = '0 0 110px';
    footerLeft.style.textAlign = 'left';
    footerLeft.style.color = '#666';

    // Center column: messages
    const footerCenter = document.createElement('div');
    footerCenter.style.flex = '1';
    footerCenter.style.textAlign = 'center';
    footerCenter.style.overflow = 'hidden';
    footerCenter.style.whiteSpace = 'nowrap';
    footerCenter.style.textOverflow = 'ellipsis';
    footerCenter.style.minHeight = '20px';
    footerCenter.style.height = '20px';
    footerCenter.style.lineHeight = '20px';
    footerCenter.style.padding = '0 4px';
    footerCenter.style.boxSizing = 'border-box';
    footerCenter.style.display = 'flex';
    footerCenter.style.alignItems = 'center';
    footerCenter.style.justifyContent = 'center';
    footerCenter.style.color = '#333';
    footerCenter.title = '';
    footerCenter.dataset.bmSystemMessage = '0';

    // Right column: About button
    const footerRight = document.createElement('div');
    footerRight.style.flex = '0 0 80px';
    footerRight.style.textAlign = 'right';
    footerRight.style.position = 'relative';

    const aboutBtn = document.createElement('button');
    aboutBtn.textContent = 'ℹ️';
    aboutBtn.className = 'bm-button';
    aboutBtn.style.fontSize = '13px';
    aboutBtn.style.padding = '2px 8px';
    aboutBtn.style.outline = 'none';
    aboutBtn.style.boxShadow = 'none';
    aboutBtn.onmousedown = e => { e.preventDefault(); };

    aboutBtn.addEventListener('focus', function (e) {
        aboutBtn.style.outline = 'none';
        aboutBtn.style.boxShadow = 'none';
    });
    aboutBtn.addEventListener('blur', function (e) {
        aboutBtn.style.outline = 'none';
        aboutBtn.style.boxShadow = 'none';
    });

    let aboutModal = null;

    aboutBtn.onclick = function () {

        if (aboutModal && panel.contains(aboutModal)) {
            aboutModal.remove();
            aboutModal = null;
            return;
        }
        aboutModal = document.createElement('div');
        aboutModal.className = 'bm-modal bm-about-modal';
        aboutModal.dataset.noAutoclose = '1';
        aboutModal.style.zIndex = 10002;
        aboutModal.style.maxWidth = '340px';
        aboutModal.style.textAlign = 'left';
        aboutModal.style.position = 'absolute';
        aboutModal.style.left = '50%';
        aboutModal.style.top = '50%';
        aboutModal.style.transform = 'translate(-50%, -50%)';

        aboutModal.innerHTML = `
                <div style="font-weight:bold;font-size:16px;margin-bottom:6px;">PA</div>
                <div style="margin-bottom:4px;">Version: ${SCRIPT_VERSION}</div>
                <div style="margin-bottom:4px;">Author: @zarkarma</div>
                <div style="margin-bottom:4px;">Last Update: ${SCRIPT_LAST_UPDATE}</div>
                <div style="margin-bottom:4px;">Features:
                    <ul style="margin:4px 0 4px 16px;padding:0;font-size:13px;">
                        <li>Folder and barcode management</li>
                        <li>Create and edit barcode & QR</li>
                        <li>Create and edit text labels</li>
                        <li>Pin, delete, rename</li>
                        <li>Local storage & quick view</li>
                        <li>Search folders and barcodes</li>
                        <li>Copy and print barcodes</li>
                        <li>📤 Pastes clipboard like scanner input</li>
                        <li>Alt+C opens CODE128 from selected text</li>
                        <li>Prints QR/2D/Code128 as shown</li>
                    </ul>
                </div>
                <div style="margin-bottom:4px;">Recent changes:
                    <ul style="margin:4px 0 4px 16px;padding:0;font-size:13px;">
                        <li>Minor bug fixes</li>
                    </ul>
                </div>
                <div style="text-align:center;margin-top:8px;">
                    <button class="bm-button" id="about-close-btn">Close</button>
                </div>
            `;
        panel.appendChild(aboutModal);
        wireModalIdleTracking(aboutModal);


        // Close via the Close button
        aboutModal.querySelector('#about-close-btn').onclick = () => {
            if (aboutModal) {
                aboutModal.remove();
                aboutModal = null;
            }
            document.removeEventListener('keydown', escHandler);
        };

        // Close via the Esc key
        function escHandler(e) {
            if (e.key === 'Escape' && aboutModal && panel.contains(aboutModal)) {
                aboutModal.remove();
                aboutModal = null;
                document.removeEventListener('keydown', escHandler);
            }
        }
        document.addEventListener('keydown', escHandler);
    };
    footerRight.appendChild(aboutBtn);

    // Add columns to footer
    footer.appendChild(footerLeft);
    footer.appendChild(footerCenter);
    footer.appendChild(footerRight);

    // --- Add a thin spacer before the footer ---
    const footerSpacer = document.createElement('div');
    footerSpacer.style.height = 'auto';
    footerSpacer.style.width = '100%';
    footerSpacer.style.background = 'transparent';
    footerSpacer.style.flex = '1 1 auto';

    // Add spacer and footer to panel (always as last children)
    if (panel.lastChild !== footerSpacer) {
        panel.appendChild(footerSpacer);
    }
    if (panel.lastChild !== footer) {
        panel.appendChild(footer);
    }

    // --- Move messages to footer ---
    window._barcodeFlash = footerCenter;

    // In Tampermonkey with @grant, `window` is a sandboxed object — real DOM events
    // never flow through it. We must use `unsafeWindow` (the real page window, which
    // sits above `document` in the capture chain) so our listener fires before any
    // page-level document handlers that might call stopImmediatePropagation.
    // In mock/non-Tampermonkey contexts unsafeWindow is undefined; fall back to window.
    const _bmEvtTarget = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    _bmEvtTarget.addEventListener('click', (e) => {
        if (!footerCenter || e.button > 0) return;
        const rect = footerCenter.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right ||
            e.clientY < rect.top || e.clientY > rect.bottom) return;
        if (window._barcodeFlashActive) return;
        if (isFooterSystemMessageActive()) return;
        fetchFooterQuote(true);
    }, true);
    fetchFooterQuote();

    // --- Update item count/status in footer based on active tab ---
    async function updateFooterCount() {
        if (!footerLeft) return;
        const setFooterLeftText = (text) => {
            footerLeft.textContent = text;
            footerLeft.title = text;
        };
        if (currentTabName === 'bookmarks') {
            const bookmarks = getBookmarks();
            if (bookmarkActiveSubFolder) {
                const count = bookmarks.filter(b => b.folder === bookmarkActiveFolder && b.subfolder === bookmarkActiveSubFolder).length;
                setFooterLeftText(`Bookmarks: ${count}`);
            } else if (bookmarkActiveFolder) {
                const subFolders = getBookmarkSubFolders(bookmarkActiveFolder);
                const directBookmarks = bookmarks.filter(b => b.folder === bookmarkActiveFolder && !b.subfolder).length;
                setFooterLeftText(`Sub-folders: ${subFolders.length} · Bookmarks: ${directBookmarks}`);
            } else {
                const folders = getBookmarkFolders();
                setFooterLeftText(`Folders: ${folders.length}`);
            }
            return;
        }

        if (currentTabName === 'todo') {
            const tasks = getTasks();
            const projects = getTodoProjects();
            const active = tasks.filter(t => !t.completed && !t.archived).length;
            const done = tasks.filter(t => t.completed && !t.archived).length;
            const archived = tasks.filter(t => t.archived).length;
            if (showingArchive) {
                setFooterLeftText(`Archive: ${archived}`);
            } else if (currentProjectFilter && currentProjectFilter !== 'all') {
                const projectTasks = tasks.filter(t => !t.archived && t.project === currentProjectFilter).length;
                setFooterLeftText(`${currentProjectFilter}: ${projectTasks}`);
            } else if (currentFilter === 'completed') {
                setFooterLeftText(`Done: ${done}`);
            } else if (currentFilter === 'all') {
                setFooterLeftText(`Tasks: ${tasks.filter(t => !t.archived).length}`);
            } else {
                setFooterLeftText(`Projects: ${projects.length} · Active: ${active}`);
            }
            return;
        }

        if (currentTabName === 'notes') {
            const notes = NoteService.getNotes();
            const activeNotes = notes.filter(note => !note.archived).length;
            const archivedNotes = notes.filter(note => note.archived).length;
            if (noteSearchQuery) {
                const matched = NoteService.searchNotes(notes.filter(note => !!note.archived === !!showArchivedNotes), noteSearchQuery).length;
                setFooterLeftText(`Found: ${matched}`);
            } else if (showArchivedNotes) {
                setFooterLeftText(`Archived: ${archivedNotes}`);
            } else if (activeNoteFolder) {
                const folderNotes = notes.filter(note => !note.archived && note.folderId === activeNoteFolder).length;
                setFooterLeftText(`${activeNoteFolder}: ${folderNotes}`);
            } else {
                setFooterLeftText(`Folders: ${NoteService.getNoteFolders().length} · Notes: ${activeNotes}`);
            }
            return;
        }

        if (activeSubFolder) {
            const barcodes = await idbGetBarcodesByFolder(activeFolder, activeSubFolder);
            setFooterLeftText(`Barcodes: ${barcodes.length}`);
        } else if (activeFolder) {
            const subFolders = getSubFolders(activeFolder);
            const directBarcodes = await idbGetBarcodesByFolder(activeFolder, '');
            setFooterLeftText(`Sub-folders: ${subFolders.length} · Barcodes: ${directBarcodes.length}`);
        } else {
            const folders = await getFolders();
            setFooterLeftText(`Folders: ${folders.length}`);
        }
    }

    // --- Call in render ---
    const oldRenderFolders = renderFolders;
    renderFolders = async function () {
        await oldRenderFolders.apply(this, arguments);
        updateFooterCount();
    };

    const oldRenderBookmarksForFooter = renderBookmarks;
    renderBookmarks = function () {
        const result = oldRenderBookmarksForFooter.apply(this, arguments);
        updateFooterCount();
        return result;
    };

    const oldRenderNotesForFooter = renderNotes;
    renderNotes = async function () {
        const result = await oldRenderNotesForFooter.apply(this, arguments);
        updateFooterCount();
        return result;
    };

    const oldRenderTasksListForFooter = renderTasksList;
    renderTasksList = async function () {
        const result = await oldRenderTasksListForFooter.apply(this, arguments);
        updateFooterCount();
        return result;
    };

    const oldSwitchTabForFooter = switchTab;
    switchTab = function (tabName) {
        const result = oldSwitchTabForFooter.apply(this, arguments);
        updateFooterCount();
        return result;
    };
    window.bmSwitchTab = switchTab;

    // Also call once at start of initialize:
    updateFooterCount();

    initialize();

    GM_addStyle(`
        .bm-panel {
            background-color: #f9f9f9;
            border: 1px solid #ccc;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            padding: 4px;
            display: flex;
            flex-direction: column;
            gap: 2px;
            font-family: sans-serif;
            font-size: 14px;
            color: #000;
            z-index: 9999;
            position: fixed;
            height: 420px; // set a default height
            min-height: 150px;
            max-height: 80vh;
            /* Add this for right scrollbar */
            scrollbar-width: thin;
            scrollbar-color: #bdbdbd #eee;
        }
        .bm-panel ::-webkit-scrollbar {
            width: 8px;
            background: #eee;
            /* Move scrollbar to right side */
            right: 0;
            left: auto;
        }
        .bm-panel ::-webkit-scrollbar-thumb {
            background: #bdbdbd;
            border-radius: 4px;
        }
        .bm-panel ::-webkit-scrollbar-thumb:hover {
            background: #888;
        }
        .bm-modal {
            color-scheme: light;
            forced-color-adjust: none;
        }
        .bm-modal-scroll {
            scrollbar-width: thin !important;
            scrollbar-color: #bdbdbd #eee !important;
            scrollbar-gutter: stable both-edges;
            color-scheme: light;
        }
        .bm-modal-scroll::-webkit-scrollbar {
            width: 8px !important;
            height: 8px !important;
            background: #eee !important;
        }
        .bm-modal-scroll::-webkit-scrollbar-track {
            background: #eee !important;
        }
        .bm-modal-scroll::-webkit-scrollbar-thumb {
            background-color: #bdbdbd !important;
            border-radius: 4px !important;
            border: 2px solid #eee !important;
        }
        .bm-modal-scroll::-webkit-scrollbar-thumb:hover {
            background-color: #888 !important;
        }
        .bm-modal-actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }
        .bm-modal-action-btn {
            background-color: #f1f1f1;
            border: 1px solid #ccc;
            padding: 4px 8px;
            cursor: pointer;
            border-radius: 6px;
            font-family: sans-serif;
            font-size: 16px;
            color: #000;
        }
        .bm-modal-action-btn:hover {
            background-color: #e0e0e0;
        }
        .bm-todo-edit-actions {
            justify-content: center !important;
            gap: 8px !important;
            margin-top: 8px !important;
            width: 100% !important;
            box-sizing: border-box !important;
            overflow-x: hidden !important;
        }
        .bm-todo-edit-actions .bm-modal-action-btn {
            flex: 0 0 auto !important;
            min-width: 0 !important;
            width: 28px !important;
            height: 28px !important;
            padding: 0 !important;
            font-size: 22px !important;
            line-height: 1 !important;
            border-radius: 0 !important;
            border: none !important;
            background: transparent !important;
            box-shadow: none !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            vertical-align: middle !important;
        }
        .bm-todo-edit-actions .bm-modal-action-btn:hover {
            background: transparent !important;
        }
        @media print {
            body * {
                visibility: hidden !important;
            }
            #bm-barcode-zoom-modal, #bm-barcode-zoom-modal *,
            #bm-text-print-sheet, #bm-text-print-sheet * {
                visibility: visible !important;
            }
            #bm-barcode-zoom-modal {
                position: fixed !important;
                left: 0 !important;
                top: 0 !important;
                transform: none !important;
                box-shadow: none !important;
                border: none !important;
                margin: 0 !important;
            }
            #bm-text-print-sheet {
                position: fixed !important;
                left: 0 !important;
                top: 0 !important;
                transform: none !important;
                box-shadow: none !important;
                border: none !important;
                margin: 0 !important;
            }
        }
        /* Ensure folderDisplay and formWrapper scrollbars are on the right */
        .bm-panel > div,
        .bm-panel .bm-folder-list,
        .bm-panel .bm-barcode-list {
            direction: ltr !important;
        }
        .bm-menu {
            display: none;
            flex-direction: column;
            border: 1px solid #ccc;
            border-radius: 6px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.1);
            position: absolute;
            background-color: #fff;
            padding: 8px;
            min-width: 100px;
            font-family: sans-serif;
            font-size: 14px;
            color: #000;
            z-index: 10000;
            top: 10%;
            left: 15%;
            margin-top: 2px;
        }
        .bm-button {
            background-color: #f1f1f1;
            border: none;
            padding: 2px 2px;
            cursor: pointer;
            border-radius: 4px;
            font-family: sans-serif;
            font-size: 14px;
            color: #000;
            margin: 1px 0;
            text-align: left;
        }
        .bm-menu-button {
            width: 32px;
            height: 32px;
            min-width: 32px;
            min-height: 32px;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: #e8f2ff;
            border: 1px solid #c8dbf2;
            color: #1f4e79;
            box-shadow: 0 2px 6px rgba(0,0,0,0.12);
            transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }
        .bm-menu-button:hover {
            background: #d7e9ff;
            box-shadow: 0 3px 8px rgba(0,0,0,0.15);
            transform: translateY(-1px);
        }
        .bm-menu-button:active {
            transform: translateY(0);
            box-shadow: 0 1px 4px rgba(0,0,0,0.12);
        }
        .bm-button:hover {
            background-color: #e0e0e0;
        }
        .bm-send-btn {
            background-color: #f1f1f1;
            border: 1px solid #ccc;
            padding: 2px 6px;
            cursor: pointer;
            border-radius: 4px;
            font-family: sans-serif;
            font-size: 12px;
            color: #000;
            margin-top: 2px;
        }
        .bm-send-btn:hover {
            background-color: #e0e0e0;
        }
        .bm-text {
            font-family: sans-serif;
            font-size: 14px;
            color: #000;
        }
        .bm-header {
            font-family: sans-serif;
            font-size: 12px;
            color: #555;
            margin-bottom: 10px;
            font-weight: bold;
            text-align: center;
        }
        .bm-input {
            padding: 8px;
            border-radius: 4px;
            border: 1px solid #ccc;
            font-family: sans-serif;
            font-size: 14px;
            color: #000;
            background: #fff !important;
        }
        #bm-print-server-modal .bm-input::placeholder {
            font-size: 10px;
            color: #777;
        }
        .bm-panel input[type="checkbox"],
        .bm-modal input[type="checkbox"],
        .bm-checkbox {
            width: 16px;
            height: 16px;
            margin: 0;
            border: 1px solid #777 !important;
            border-radius: 3px;
            background-color: #fff !important;
            background-image: linear-gradient(#fff, #fff) !important;
            background: #fff !important;
            background-clip: padding-box;
            box-shadow: inset 0 0 0 9999px #fff;
            color-scheme: light;
            appearance: none !important;
            -webkit-appearance: none !important;
            -moz-appearance: none !important;
            forced-color-adjust: none;
            outline: 0 !important;
            filter: none !important;
            display: inline-grid;
            place-content: center;
        }
        .bm-panel input[type="checkbox"]::after,
        .bm-modal input[type="checkbox"]::after,
        .bm-checkbox::after {
            content: '';
            width: 8px;
            height: 4px;
            border: 2px solid #1976d2;
            border-top: 0;
            border-right: 0;
            transform: rotate(-45deg) scale(0);
            transform-origin: center;
        }
        .bm-panel input[type="checkbox"]:checked::after,
        .bm-modal input[type="checkbox"]:checked::after,
        .bm-checkbox:checked::after {
            transform: rotate(-45deg) scale(1);
        }
        .bm-input.bm-copies-input {
            border-radius: 6px !important;
            width: 42px !important;
            height: 30px !important;
            line-height: 30px !important;
            appearance: auto !important;
            -webkit-appearance: auto !important;
            -moz-appearance: number-input !important;
            background-color: #fff !important;
            color: #000 !important;
            border: 1px solid #ccc !important;
            display: inline-block !important;
            color-scheme: light;
        }
        .bm-input.bm-copies-input::-webkit-outer-spin-button,
        .bm-input.bm-copies-input::-webkit-inner-spin-button {
            opacity: 1;
            -webkit-appearance: inner-spin-button;
            margin: 0;
        }
        .bm-flash {
            font-size: 14px;
            padding: 8px;
            border-radius: 4px;
            margin-bottom: 8px;
            display: none;
            font-family: sans-serif;
        }
        .bm-flash.success {
            background-color: #dff0d8;
            color: #3c763d;
            border: 1px solid #d6e9c6;
        }
        .bm-flash.error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .bm-footer .bm-flash {
            padding: 0 4px;
            margin: 0;
            font-size: 12px;
            line-height: 20px;
            height: 20px;
            box-sizing: border-box;
        }
        .bm-folder-icon-wrapper {
            display: flex;
            flex-direction: column;
            align-items: center;
            font-size: 12px;
            font-family: sans-serif;
            width: 60px;
            text-align: center;
            position: relative;
            cursor: pointer;
        }
        .bm-folder-icon {
            font-size: 36px;
            margin-bottom: 2px;
            margin-top: 2px;
        }
        .bm-folder-label {
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            white-space: normal;
            max-width: 60px;
            display: block;
            text-align: center;
            font-size: 12px;
            margin-top: 2px;
            line-height: 1.2;
            word-break: normal;
            overflow-wrap: normal;
            hyphens: none;
            height: 2.4em;
        }
        .bm-folder-menu-icon {
            font-size: 20px;
            cursor: pointer;
            position: absolute;
            top: 0px;
            right: 0px;
            opacity: 1;
            transition: opacity 0.3s ease;

        }
        .bm-folder-options-menu {
            display: block;
            position: absolute;
            background-color: white;
            border: 1px solid #ccc;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            padding: 1px;
            font-size: 12px;
            z-index: 10000;
            border-radius: 4px;
            top: 100%;
            left: 0;
            margin-top: 2px;
            color: #000;
            display: flex;
            flex-direction: column;
        }
        .bm-folder-options-menu .bm-button {
            margin: 1px 0;
            padding: 4px 8px;
            font-size: 12px;
            text-align: left;
        }
        .bm-modal {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: #fff;
            border: 1px solid #ccc;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            padding: 4px;
            z-index: 10001;
            min-width: 200px;
            text-align: center;
            color: #000;
        }
        .bm-panel ::-webkit-scrollbar {
            width: 8px;
            background: #eee;
        }
        .bm-panel ::-webkit-scrollbar-thumb {
            background: #bdbdbd;
            border-radius: 4px;
        }
        .bm-panel ::-webkit-scrollbar-thumb:hover {
            background: #888;
        }
        .bm-panel, .bm-panel * {
            user-select: none;
        }
        .bm-barcode-item span, .bm-barcode-item a {
            user-select: text !important;
        }
        .bm-barcode-item {
            box-sizing: border-box;
            margin: 4px;
            background: #fff;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 4px 2px 6px 2px;
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            transition: box-shadow 0.2s;
            justify-content: flex-start;
        }
        .bm-barcode-item .bm-barcode-preview {
            display: block;
            margin: 0 auto 4px auto;
            max-width: 100px;
            height: auto;
        }
        .bm-barcode-item.bm-format-qr .bm-barcode-preview,
        .bm-barcode-item.bm-format-2d .bm-barcode-preview,
        .bm-barcode-item.bm-format-qrcode .bm-barcode-preview {
            width: 100px;
            height: 100px;
            max-width: 100px;
            max-height: 100px;
            aspect-ratio: 1 / 1;
            object-fit: contain;
        }
        .bm-barcode-item .bm-barcode-preview-linear {
            display: block;
            margin: 0 auto 4px auto;
            max-width: none;
            width: auto;
            height: auto;
            flex: 0 0 auto;
        }
        .bm-barcode-item .bm-text-preview {
            display: block;
            margin: 0 auto 4px auto;
            width: 100px;
            min-height: 100px;
            max-height: 100px;
            padding: 4px;
            box-sizing: border-box;
            border: 1px dashed #bbb;
            border-radius: 4px;
            font-family: monospace;
            font-size: 10px;
            line-height: 1.2;
            color: #000;
            white-space: pre-line;
            overflow: hidden;
        }
        .bm-batch-checkbox {
            margin-top: 4px;
            cursor: pointer;
        }
        .bm-batch-bar {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 6px 4px;
            margin: 4px 0 6px 0;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            background: #fafafa;
            font-size: 12px;
        }
        .bm-batch-btn {
            background-color: #f1f1f1;
            border: 1px solid #ccc;
            padding: 0 6px;
            cursor: pointer;
            border-radius: 6px;
            font-family: sans-serif;
            font-size: 12px;
            color: #000;
            height: 30px;
            line-height: 30px;
            min-width: 30px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
        }
        .bm-batch-btn:hover {
            background-color: #e0e0e0;
        }
        /* Tab System */
        .bm-tab-bar {
            display: flex;
            flex-direction: row;
            border-bottom: 1px solid #c8dbf2;
            margin-bottom: 6px;
            width: 100%;
            background-color: transparent;
        }
        .bm-tab {
            padding: 6px 12px;
            cursor: pointer;
            border: none;
            background: none;
            font-family: sans-serif;
            font-size: 13px;
            font-weight: 500;
            color: #555;
            border-bottom: 2px solid transparent;
            transition: all 0.2s ease;
            outline: none;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .bm-tab:hover {
            color: #1f4e79;
            background-color: #f1f7fe;
        }
        .bm-tab.active {
            color: #1f4e79;
            font-weight: bold;
            border-bottom: 2px solid #1f4e79;
        }
        .bm-tab-content {
            display: none !important;
            flex-direction: column !important;
            flex: 1 1 auto !important;
            min-height: 0 !important;
            overflow: auto !important;
            width: 100% !important;
        }
        .bm-tab-content.active {
            display: flex !important;
        }
        /* Todo List Styles */
        .bm-todo-container {
            gap: 8px !important;
            padding: 6px 8px !important;
            box-sizing: border-box !important;
            background-color: #f9f9f9 !important;
            color: #000000 !important;
        }
        .bm-todo-form {
            display: flex !important;
            flex-direction: column !important;
            gap: 6px !important;
            background-color: #ffffff !important;
            border: 1px solid #c8dbf2 !important;
            border-radius: 8px !important;
            padding: 8px !important;
            box-sizing: border-box !important;
        }
        .bm-todo-form-row {
            display: flex !important;
            gap: 6px !important;
            align-items: center !important;
            width: 100% !important;
        }
        .bm-todo-input {
            flex: 1 !important;
            padding: 6px !important;
            border: 1px solid #cccccc !important;
            border-radius: 6px !important;
            font-size: 13px !important;
            outline: none !important;
            box-sizing: border-box !important;
            background-color: #ffffff !important;
            color: #000000 !important;
        }
        .bm-todo-input:focus {
            border-color: #1f4e79 !important;
        }
        .bm-todo-select {
            padding: 5px !important;
            border: 1px solid #cccccc !important;
            border-radius: 6px !important;
            font-size: 12px !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            outline: none !important;
            cursor: pointer !important;
            box-sizing: border-box !important;
        }
        .bm-todo-select option {
            background-color: #ffffff !important;
            color: #000000 !important;
        }
        .bm-todo-date {
            padding: 4px !important;
            border: 1px solid #cccccc !important;
            border-radius: 6px !important;
            font-size: 12px !important;
            outline: none !important;
            width: 110px !important;
            box-sizing: border-box !important;
            background-color: #ffffff !important;
            color: #000000 !important;
        }
        /* Rich text note editor */
        .bm-note-editor:empty::before {
            content: attr(data-placeholder);
            color: #9aa7b0;
            pointer-events: none;
        }
        .bm-note-editor img {
            max-width: 100% !important;
            height: auto !important;
            border-radius: 4px !important;
        }
        .bm-note-editor code {
            background: #eef1f4 !important;
            border: 1px solid #e0e5ea !important;
            border-radius: 3px !important;
            padding: 1px 4px !important;
            font-family: monospace !important;
            font-size: 12px !important;
            color: #c7254e !important;
        }
        .bm-note-editor h2 { font-size: 17px !important; margin: 6px 0 4px !important; }
        .bm-note-editor h3 { font-size: 14px !important; margin: 5px 0 3px !important; }
        .bm-note-editor ul,
        .bm-note-editor ol { margin: 4px 0 4px 22px !important; padding: 0 !important; }
        .bm-note-editor a { color: #1976d2 !important; }
        .bm-note-editor blockquote {
            border-left: 3px solid #cfd8dc !important;
            margin: 4px 0 !important;
            padding: 2px 10px !important;
            color: #546e7a !important;
        }
        .bm-todo-list {
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: wrap !important;
            align-content: flex-start !important;
            justify-content: flex-start !important;
            gap: 6px !important;
            overflow-y: auto !important;
            flex: 1 1 auto !important;
            margin-top: 4px !important;
            padding-right: 2px !important;
        }
        .bm-todo-item {
            display: flex !important;
            align-items: flex-start !important;
            gap: 8px !important;
            padding: 8px !important;
            background-color: #ffffff !important;
            border: 1px solid #eef2f7 !important;
            border-radius: 8px !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.02) !important;
            transition: all 0.2s ease !important;
            box-sizing: border-box !important;
            color: #000000 !important;
            flex: 1 1 350px !important;
            max-width: 445px !important;
        }
        .bm-todo-item:hover {
            border-color: #c8dbf2 !important;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05) !important;
        }
        .bm-todo-item.completed {
            opacity: 0.65 !important;
            background-color: #fbfbfb !important;
        }
        .bm-todo-checkbox {
            cursor: pointer !important;
            margin-top: 3px !important;
            width: 16px !important;
            height: 16px !important;
            min-width: 16px !important;
            accent-color: #1f4e79 !important;
        }
        .bm-todo-text-wrapper {
            display: flex !important;
            flex-direction: column !important;
            flex: 1 !important;
            min-width: 0 !important;
        }
        .bm-todo-text {
            font-size: 13px !important;
            line-height: 1.4 !important;
            word-break: break-word !important;
            color: #333333 !important;
            text-align: left !important;
        }
        .bm-todo-item.completed .bm-todo-text {
            text-decoration: line-through !important;
            color: #888888 !important;
        }
        .bm-todo-meta {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
            margin-top: 4px !important;
            align-items: center !important;
        }
        .bm-todo-badge {
            font-size: 10px !important;
            padding: 1px 6px !important;
            border-radius: 10px !important;
            font-weight: 500 !important;
            display: inline-flex !important;
            align-items: center !important;
        }
        .bm-todo-badge.prio-high {
            background-color: #ffeef0 !important;
            color: #d32f2f !important;
            border: 1px solid #ffcdd2 !important;
        }
        .bm-todo-badge.prio-medium {
            background-color: #fff9db !important;
            color: #f57f17 !important;
            border: 1px solid #fff59d !important;
        }
        .bm-todo-badge.prio-low {
            background-color: #ebfbee !important;
            color: #2e7d32 !important;
            border: 1px solid #c8e6c9 !important;
        }
        .bm-todo-badge.due-date {
            background-color: #f3f3f3 !important;
            color: #666666 !important;
            border: 1px solid #e0e0e0 !important;
        }
        .bm-todo-badge.due-date.overdue {
            background-color: #ffeef0 !important;
            color: #d32f2f !important;
            border: 1px solid #ffcdd2 !important;
            font-weight: bold !important;
        }
        .bm-todo-link {
            font-size: 10px !important;
            color: #1f4e79 !important;
            background-color: #e8f2ff !important;
            border: 1px solid #c8dbf2 !important;
            padding: 1px 6px !important;
            border-radius: 10px !important;
            cursor: pointer !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 2px !important;
            transition: background 0.2s !important;
        }
        .bm-todo-link:hover {
            background-color: #d7e9ff !important;
        }
        .bm-todo-delete-btn {
            background: none !important;
            border: none !important;
            color: #bbbbbb !important;
            cursor: pointer !important;
            padding: 2px !important;
            font-size: 14px !important;
            line-height: 1 !important;
            transition: color 0.2s !important;
        }
        .bm-todo-delete-btn:hover {
            color: #d32f2f !important;
        }
        .bm-todo-filters {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 4px !important;
            border-bottom: 1px solid #eee !important;
            margin-bottom: 4px !important;
            position: relative !important;
            z-index: 1000 !important;
            overflow: visible !important;
        }
        .bm-todo-filter-group {
            display: flex !important;
            gap: 4px !important;
        }
        .bm-todo-filter-btn {
            background: none !important;
            border: 1px solid transparent !important;
            padding: 2px 6px !important;
            border-radius: 4px !important;
            font-size: 11px !important;
            cursor: pointer !important;
            color: #666666 !important;
        }
        .bm-todo-filter-btn:hover {
            background-color: #eeeeee !important;
        }
        .bm-todo-filter-btn.active {
            background-color: #e8f2ff !important;
            color: #1f4e79 !important;
            border-color: #c8dbf2 !important;
            font-weight: bold !important;
        }
        .bm-todo-clear-btn {
            background: none !important;
            border: none !important;
            font-size: 11px !important;
            color: #d32f2f !important;
            cursor: pointer !important;
        }
        .bm-todo-clear-btn:hover {
            text-decoration: underline !important;
        }
        .bm-todo-empty {
            text-align: center !important;
            color: #999999 !important;
            padding: 20px 0 !important;
            font-size: 13px !important;
        }
        /* Todo Pro Features CSS */
        .bm-todo-header-actions {
            display: flex !important;
            gap: 6px !important;
            align-items: center !important;
        }
        .bm-todo-header-btn {
            background: none !important;
            border: none !important;
            cursor: pointer !important;
            font-size: 15px !important;
            padding: 2px !important;
            line-height: 1 !important;
            transition: transform 0.2s !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        .bm-todo-header-btn:hover {
            transform: scale(1.15) !important;
        }
        .bm-todo-wellness-toggles {
            display: flex !important;
            gap: 4px !important;
            align-items: center !important;
            justify-content: center !important;
            flex: 1 1 auto !important;
            position: relative !important;
            z-index: 1001 !important;
            overflow: visible !important;
        }
        .bm-todo-wellness-btn {
            background: none !important;
            border: 1px solid transparent !important;
            padding: 2px 6px !important;
            border-radius: 999px !important;
            font-size: 11px !important;
            cursor: pointer !important;
            color: #777777 !important;
            line-height: 1.2 !important;
            position: relative !important;
            z-index: 1002 !important;
            overflow: visible !important;
        }
        .bm-todo-wellness-btn.active {
            background-color: #e8f7ee !important;
            color: #1b7f3a !important;
            border-color: #bfe5cb !important;
            font-weight: bold !important;
        }
        .bm-todo-wellness-btn:hover {
            background-color: #eeeeee !important;
            z-index: 99999 !important;
        }
        .wt-icon {
            position: relative !important;
            z-index: 1003 !important;
            display: inline-block !important;
        }
        .wt-icon:hover {
            z-index: 999999 !important;
        }
        .wt-tooltip {
            position: absolute !important;
            top: 50% !important;
            left: 100% !important;
            margin-left: 6px !important;
            transform: translateY(-50%) !important;
            background-color: #1f4e79 !important;
            color: #ffffff !important;
            padding: 3px 7px !important;
            border-radius: 4px !important;
            font-size: 10px !important;
            font-weight: bold !important;
            white-space: nowrap !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
            transition: opacity 0.15s ease, visibility 0.15s ease !important;
            z-index: 9999999 !important;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3) !important;
        }
        .wt-icon:hover .wt-tooltip {
            opacity: 1 !important;
            visibility: visible !important;
        }
        .bm-todo-nlp-preview {
            font-size: 11px !important;
            color: #1f4e79 !important;
            background-color: #e8f2ff !important;
            border: 1px dashed #c8dbf2 !important;
            padding: 4px 6px !important;
            border-radius: 4px !important;
            margin-top: 2px !important;
            display: none;
            align-items: center !important;
            gap: 4px !important;
            box-sizing: border-box !important;
            width: 100% !important;
        }
        .bm-todo-project-badge {
            font-size: 9px !important;
            padding: 1px 5px !important;
            border-radius: 4px !important;
            background-color: #eceff1 !important;
            color: #455a64 !important;
            border: 1px solid #cfd8dc !important;
            font-weight: bold !important;
            display: inline-flex !important;
            align-items: center !important;
        }
        .bm-todo-tag-badge {
            font-size: 9px !important;
            padding: 1px 5px !important;
            border-radius: 4px !important;
            background-color: #efebe9 !important;
            color: #5d4037 !important;
            border: 1px solid #d7ccc8 !important;
            font-weight: 500 !important;
            display: inline-flex !important;
            align-items: center !important;
        }
        .bm-todo-item.prio-p1 {
            border-left: 4px solid #d32f2f !important;
        }
        .bm-todo-item.prio-p2 {
            border-left: 4px solid #f57f17 !important;
        }
        .bm-todo-item.prio-p3 {
            border-left: 4px solid #2e7d32 !important;
        }
        .bm-todo-item.prio-p4 {
            border-left: 4px solid #78909c !important;
        }
        .bm-todo-progress-container {
            width: 100% !important;
            background-color: #eeeeee !important;
            border-radius: 4px !important;
            height: 4px !important;
            margin-top: 4px !important;
            overflow: hidden !important;
        }
        .bm-todo-progress-bar {
            height: 100% !important;
            background-color: #2e7d32 !important;
            width: 0%;
            transition: width 0.3s ease !important;
        }
        .bm-todo-subtasks-container {
            margin-top: 8px !important;
            padding: 6px !important;
            background-color: #f8f9fa !important;
            border: 1px solid #e0e0e0 !important;
            border-radius: 6px !important;
            width: 100% !important;
            box-sizing: border-box !important;
            display: grid !important;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)) !important;
            gap: 6px !important;
            align-items: stretch !important;
        }
        .bm-todo-subtask-item {
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            padding: 6px 8px !important;
            font-size: 12px !important;
            min-width: 0 !important;
            border: 1px solid #e4e7eb !important;
            border-radius: 6px !important;
            background-color: #ffffff !important;
            box-sizing: border-box !important;
        }
        .bm-todo-subtask-text {
            flex: 1 !important;
            color: #333333 !important;
            min-width: 0 !important;
            word-break: break-word !important;
        }
        .bm-todo-subtask-item.completed .bm-todo-subtask-text {
            text-decoration: line-through !important;
            color: #888888 !important;
        }
        .bm-todo-subtasks-empty {
            grid-column: 1 / -1 !important;
            font-size: 11px !important;
            color: #888888 !important;
            text-align: center !important;
            padding: 6px 0 !important;
        }
        .bm-todo-pomodoro-timer {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 8px !important;
            padding: 10px !important;
            background-color: #fff5f5 !important;
            border: 1px solid #ffcdd2 !important;
            border-radius: 8px !important;
            margin-top: 10px !important;
            width: 100% !important;
            box-sizing: border-box !important;
        }
        .bm-todo-pomo-display {
            font-size: 24px !important;
            font-weight: bold !important;
            color: #d32f2f !important;
            font-family: monospace !important;
        }
        .bm-todo-pomo-controls {
            display: flex !important;
            gap: 6px !important;
        }
        .bm-todo-pomo-btn {
            padding: 4px 10px !important;
            font-size: 11px !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            border: 1px solid #d32f2f !important;
            background-color: #ffffff !important;
            color: #d32f2f !important;
            font-weight: bold !important;
        }
        .bm-todo-pomo-btn:hover {
            background-color: #d32f2f !important;
            color: #ffffff !important;
        }
        .bm-todo-pomo-sessions {
            font-size: 10px !important;
            color: #7f1d1d !important;
            font-weight: 500 !important;
        }
        .bm-todo-pomo-presets {
            display: flex !important;
            gap: 4px !important;
            flex-wrap: wrap !important;
            justify-content: center !important;
            width: 100% !important;
        }
        .bm-todo-pomo-presets label {
            font-size: 10px !important;
            color: #7f1d1d !important;
            font-weight: 600 !important;
            width: 100% !important;
            text-align: center !important;
            margin-top: 4px !important;
        }
        .bm-todo-pomo-preset-btn {
            padding: 3px 8px !important;
            font-size: 10px !important;
            border-radius: 12px !important;
            cursor: pointer !important;
            border: 1px solid #e0c4c4 !important;
            background-color: #fff !important;
            color: #7f1d1d !important;
            font-weight: 500 !important;
            transition: all 0.15s ease !important;
        }
        .bm-todo-pomo-preset-btn:hover {
            background-color: #ffebee !important;
            border-color: #d32f2f !important;
        }
        .bm-todo-pomo-preset-btn.active {
            background-color: #d32f2f !important;
            color: #fff !important;
            border-color: #d32f2f !important;
        }
        .bm-todo-pomo-inline {
            display: inline-flex !important;
            align-items: center !important;
            gap: 4px !important;
            padding: 2px 8px !important;
            border-radius: 12px !important;
            font-size: 10px !important;
            font-weight: 600 !important;
            font-family: monospace !important;
            animation: bm-pomo-pulse 1.5s ease-in-out infinite !important;
        }
        .bm-todo-pomo-inline.work {
            background-color: #ffebee !important;
            color: #d32f2f !important;
            border: 1px solid #ffcdd2 !important;
        }
        .bm-todo-pomo-inline.break {
            background-color: #e8f5e9 !important;
            color: #2e7d32 !important;
            border: 1px solid #c8e6c9 !important;
        }
        @keyframes bm-pomo-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
        .bm-todo-subtasks-inline {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
            align-items: flex-start !important;
            width: 100% !important;
            margin-top: 4px !important;
            padding: 4px 0 0 0 !important;
            border-top: 1px dashed #e0e0e0 !important;
        }
        .bm-todo-subtask-toggle {
            display: flex !important;
            align-items: center !important;
            gap: 4px !important;
            background: none !important;
            border: none !important;
            cursor: pointer !important;
            font-size: 11px !important;
            color: #666 !important;
            padding: 2px 0 !important;
            font-weight: 500 !important;
        }
        .bm-todo-subtask-toggle:hover {
            color: #1f4e79 !important;
        }
        .bm-todo-subtask-inline-item {
            display: inline-flex !important;
            align-items: center !important;
            gap: 6px !important;
            padding: 3px 4px !important;
            font-size: 11px !important;
            border-radius: 4px !important;
            background-color: #f8f9fa !important;
            border: 1px solid #e4e7eb !important;
            flex: 0 0 auto !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
        }
        .bm-todo-subtask-inline-item:hover {
            background-color: #f5f5f5 !important;
        }
        .bm-todo-subtask-inline-item.done span {
            text-decoration: line-through !important;
            color: #999 !important;
        }
        .bm-todo-subtask-inline-item span {
            word-break: break-word !important;
        }
        .bm-todo-insights {
            display: flex !important;
            flex-direction: column !important;
            gap: 8px !important;
            padding: 12px !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            box-sizing: border-box !important;
            width: 100% !important;
        }
        .bm-todo-insights-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
            width: 100% !important;
        }
        .bm-todo-insights-card {
            background-color: #f5f7fa !important;
            border: 1px solid #e4e7eb !important;
            border-radius: 6px !important;
            padding: 8px !important;
            text-align: center !important;
            box-sizing: border-box !important;
        }
        .bm-todo-insights-val {
            font-size: 18px !important;
            font-weight: bold !important;
            color: #1f4e79 !important;
        }
        .bm-todo-insights-lbl {
            font-size: 10px !important;
            color: #666666 !important;
        }
        .bm-todo-status-strip {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 6px !important;
            width: 100% !important;
            margin: 0 0 6px 0 !important;
            box-sizing: border-box !important;
        }
        .bm-todo-status-card {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 2px !important;
            min-height: 40px !important;
            padding: 6px 8px !important;
            border: 1px solid #e4e7eb !important;
            border-radius: 8px !important;
            background: #fafbfc !important;
            box-sizing: border-box !important;
        }
        .bm-todo-status-card.is-alert {
            border-color: #ffcdd2 !important;
            background: #fff8f8 !important;
        }
        .bm-todo-status-value {
            font-size: 16px !important;
            font-weight: 700 !important;
            color: #1f4e79 !important;
            line-height: 1.1 !important;
        }
        .bm-todo-status-card.is-alert .bm-todo-status-value {
            color: #d32f2f !important;
        }
        .bm-todo-status-label {
            font-size: 10px !important;
            color: #667085 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.04em !important;
        }
        .bm-todo-snooze-inline {
            display: inline-flex !important;
            align-items: center !important;
            gap: 4px !important;
            padding: 1px 6px !important;
            border-radius: 999px !important;
            background: #fff8e1 !important;
            color: #8a5a00 !important;
            border: 1px solid #ffe082 !important;
            font-size: 10px !important;
            font-weight: 700 !important;
            line-height: 1.4 !important;
        }
        .bm-todo-snooze-time {
            font-variant-numeric: tabular-nums !important;
            letter-spacing: 0.02em !important;
        }
        .bm-todo-snooze-stop {
            border: none !important;
            background: transparent !important;
            color: #b71c1c !important;
            cursor: pointer !important;
            padding: 0 !important;
            margin: 0 !important;
            font-size: 11px !important;
            line-height: 1 !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        .bm-todo-snooze-stop:hover,
        .bm-todo-snooze-stop:focus {
            color: #d32f2f !important;
            outline: none !important;
        }
        .bm-todo-edit-modal-body {
            display: flex !important;
            flex-direction: column !important;
            gap: 8px !important;
            width: 100% !important;
            color: #000000 !important;
        }
        .bm-todo-field-group {
            display: flex !important;
            flex-direction: column !important;
            gap: 4px !important;
            width: 100% !important;
            box-sizing: border-box !important;
        }
        .bm-todo-field-label {
            font-size: 11px !important;
            font-weight: bold !important;
            color: #555555 !important;
        }
        .bm-todo-field-input {
            width: 100% !important;
            padding: 6px !important;
            border: 1px solid #cccccc !important;
            border-radius: 6px !important;
            font-size: 12px !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            box-sizing: border-box !important;
            outline: none !important;
        }
        .bm-todo-field-input:focus {
            border-color: #1f4e79 !important;
        }
        .bm-todo-time-picker-wrap {
            position: relative !important;
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            flex: 0 0 126px !important;
            width: 126px !important;
            min-width: 126px !important;
            box-sizing: border-box !important;
        }
        .bm-todo-time-picker-wrap .bm-todo-field-input {
            flex: 1 1 auto !important;
            min-width: 0 !important;
        }
        .bm-todo-time-picker-btn {
            width: 30px !important;
            min-width: 30px !important;
            height: 30px !important;
            padding: 0 !important;
            border: 1px solid #cccccc !important;
            border-radius: 6px !important;
            background: #ffffff !important;
            color: #1f4e79 !important;
            font-size: 16px !important;
            line-height: 1 !important;
            cursor: pointer !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-sizing: border-box !important;
        }
        .bm-todo-time-picker-btn:hover,
        .bm-todo-time-picker-btn:focus {
            border-color: #1f4e79 !important;
            background: #f5f9ff !important;
            outline: none !important;
        }
        .bm-todo-time-picker-popup {
            position: absolute !important;
            z-index: 1000002 !important;
            width: 190px !important;
            padding: 8px !important;
            border: 1px solid #d0d7de !important;
            border-radius: 10px !important;
            background: #ffffff !important;
            box-shadow: 0 10px 28px rgba(15, 23, 42, 0.18) !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
        }
        .bm-todo-time-picker-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr 62px !important;
            gap: 6px !important;
            align-items: start !important;
        }
        .bm-todo-time-picker-col {
            display: flex !important;
            flex-direction: column !important;
            gap: 0 !important;
            min-width: 0 !important;
        }
        .bm-todo-time-picker-col-title {
            display: none !important;
        }
        .bm-todo-time-picker-list {
            max-height: 176px !important;
            overflow-y: auto !important;
            padding: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-sizing: border-box !important;
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
        }
        .bm-todo-time-picker-list::-webkit-scrollbar {
            width: 0 !important;
            height: 0 !important;
            display: none !important;
        }
        .bm-todo-time-picker-item {
            width: 100% !important;
            min-width: 0 !important;
            padding: 7px 0 !important;
            border: none !important;
            border-radius: 8px !important;
            background: transparent !important;
            color: #0f172a !important;
            font-size: 15px !important;
            font-weight: 500 !important;
            line-height: 1 !important;
            box-sizing: border-box !important;
            cursor: pointer !important;
            text-align: center !important;
        }
        .bm-todo-time-picker-item:hover,
        .bm-todo-time-picker-item:focus {
            background: #edf4ff !important;
            color: #1f4e79 !important;
            outline: none !important;
        }
        .bm-todo-time-picker-item.active {
            background: #2f6fe4 !important;
            color: #ffffff !important;
            font-weight: 700 !important;
        }
        .bm-todo-recurrence-badge {
            font-size: 9px !important;
            padding: 1px 5px !important;
            border-radius: 4px !important;
            background-color: #efebe9 !important;
            color: #5d4037 !important;
            border: 1px solid #d7ccc8 !important;
            font-weight: 500 !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 2px !important;
        }
    `);

})();
