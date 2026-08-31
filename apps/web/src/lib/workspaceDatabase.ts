import {
  applyWorkspaceCommand,
  emptyWorkspace,
  isWorkspaceDocument,
  WorkflowError,
  type WorkspaceCommand,
  type WorkspaceDocument,
} from "../domain/workspace";

const DATABASE_NAME = "nexus-forge-workspace";
const STORE_NAME = "workspace";
const DOCUMENT_KEY = "current";
let connection: Promise<IDBDatabase> | null = null;

export class WorkspaceStorageError extends Error {
  constructor(
    message = "브라우저에 기록을 저장하지 못했습니다. 저장소 접근 권한과 여유 공간을 확인한 뒤 다시 시도해 주세요.",
  ) {
    super(message);
    this.name = "WorkspaceStorageError";
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(
        new WorkspaceStorageError(
          "이 브라우저에서 기록 저장소를 사용할 수 없습니다.",
        ),
      );
      return;
    }
    let settled = false;
    const fail = (message?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(new WorkspaceStorageError(message));
    };
    const timer = window.setTimeout(
      () =>
        fail(
          "저장소 연결 시간이 초과되었습니다. 다른 탭을 닫고 다시 시도해 주세요.",
        ),
      5_000,
    );
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE_NAME);
    request.onerror = () => fail();
    request.onblocked = () =>
      fail(
        "다른 탭이 저장소 갱신을 막고 있습니다. 다른 탭을 닫은 뒤 다시 시도해 주세요.",
      );
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        connection = null;
      };
      database.onclose = () => {
        connection = null;
      };
      resolve(database);
    };
  }).catch((error: unknown) => {
    connection = null;
    throw error instanceof WorkspaceStorageError
      ? error
      : new WorkspaceStorageError();
  });
  return connection;
}

/** Read-modify-write runs inside one IDB transaction, serializing mutations from other tabs. */
async function transaction(
  command?: WorkspaceCommand,
  reset = false,
): Promise<WorkspaceDocument> {
  const database = await openDatabase();
  return new Promise<WorkspaceDocument>((resolve, reject) => {
    const tx = database.transaction(
      STORE_NAME,
      command || reset ? "readwrite" : "readonly",
    );
    let result: WorkspaceDocument;
    let failure: Error | undefined;
    const timer = window.setTimeout(() => {
      failure = new WorkspaceStorageError(
        "저장 시간이 초과되었습니다. 변경 결과를 다시 확인해 주세요.",
      );
      tx.abort();
    }, 5_000);
    tx.oncomplete = () => {
      window.clearTimeout(timer);
      resolve(result);
    };
    tx.onabort = () => {
      window.clearTimeout(timer);
      reject(failure ?? new WorkspaceStorageError());
    };
    tx.onerror = () => {
      failure ??= new WorkspaceStorageError();
    };
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(DOCUMENT_KEY);
    request.onsuccess = () => {
      try {
        const raw: unknown = request.result;
        if (reset) {
          // Check the committed record, not just this tab's possibly stale snapshot.
          if (isWorkspaceDocument(raw) && raw.pendingVerification !== null)
            throw new WorkflowError(
              "결과를 확인하지 못한 작업 요청이 있습니다. 신호 분석에서 같은 요청의 결과를 확인한 뒤 초기화해 주세요.",
            );
          result = emptyWorkspace();
          result.revision = Math.max(
            Date.now(),
            isWorkspaceDocument(raw) ? raw.revision + 1 : 0,
          );
          store.put(result, DOCUMENT_KEY);
          return;
        }
        if (raw !== undefined && !isWorkspaceDocument(raw))
          throw new WorkspaceStorageError(
            "저장 기록의 형식을 확인할 수 없습니다. 기존 데이터는 덮어쓰지 않았습니다. 설정에서 초기화할 수 있습니다.",
          );
        const previous = raw === undefined ? emptyWorkspace() : raw;
        result = command ? applyWorkspaceCommand(previous, command) : previous;
        if (!isWorkspaceDocument(result))
          throw new WorkflowError(
            "변경한 기록의 형식이 올바르지 않습니다. 변경 사항은 저장하지 않았습니다.",
          );
        if (result !== previous) store.put(result, DOCUMENT_KEY);
      } catch (error) {
        failure = error instanceof Error ? error : new WorkspaceStorageError();
        tx.abort();
      }
    };
  }).catch((error: unknown) => {
    if (
      error instanceof WorkspaceStorageError ||
      error instanceof WorkflowError
    )
      throw error;
    throw new WorkspaceStorageError();
  });
}

export const workspaceDatabase = {
  read: () => transaction(),
  apply: (command: WorkspaceCommand) => transaction(command),
  reset: () => transaction(undefined, true),
};
