import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import KinoFile from '../types/KinoFile'
import KinodeApi from '@kinode/client-api'
import { TreeFile } from '../types/TreeFile'
import { getRootPath } from '../utils/file'

export interface FileTransferStore {
  handleWsMessage: (message: string) => void
  files: KinoFile[]
  setFiles: (files: KinoFile[]) => void
  set: (partial: FileTransferStore | Partial<FileTransferStore>) => void
  filesInProgress: { [key: string]: number }
  setFilesInProgress: (filesInProgress: { [key: string]: number }) => void
  api: KinodeApi | null
  setApi: (api: KinodeApi) => void
  refreshFiles: () => void
  knownNodes: string[]
  setKnownNodes: (knownNodes: string[]) => void
  onAddFolder: (root: string, createdFolderName: string, callback: () => void) => void
  onMoveFile: (file: TreeFile, dest: TreeFile) => void
}

type WsMessage =
  | { kind: 'progress', data: { name: string, progress: number } }
  | { kind: 'uploaded', data: { name: string, size: number } }

const useFileTransferStore = create<FileTransferStore>()(
  persist(
    (set, get) => ({
      files: [],
      filesInProgress: {},
      knownNodes: [],
      setKnownNodes: (knownNodes) => set({ knownNodes }),
      api: null,
      setApi: (api) => set({ api }),
      setFilesInProgress: (filesInProgress) => set({ filesInProgress }),
      setFiles: (files) => set({ files }),    
      handleWsMessage: (json: string | Blob) => {
        const { filesInProgress, setFilesInProgress, setKnownNodes } = get()
        if (typeof json === 'string') {
          try {
            console.log('WS: GOT MESSAGE', json)
            const { kind, data } = JSON.parse(json) as WsMessage;
            if (kind === 'progress') {
              const { name, progress } = data
              const fip = { ...filesInProgress, [name]: progress }
              console.log({ fip })
              setFilesInProgress(fip)
              if (progress >= 100) {
                get().refreshFiles()
              }
            } else if (kind === 'uploaded') {
              get().refreshFiles()
            } else if (kind === 'file_update') {
              get().refreshFiles()
            } else if (kind === 'state') {
              const { known_nodes } = data
              setKnownNodes(known_nodes)
            }
          } catch (error) {
            console.error("Error parsing WebSocket message", error);
          }
        } else {
            console.log('WS: GOT BLOB', json)
        }
      },
      onAddFolder: (root: string, createdFolderName: string, callback: () => void) => {
        const { api } = get();
        if (!api) return alert('No API');
        if (!createdFolderName) return alert('No folder name');
        if (!window.confirm(`Are you sure you want to add ${createdFolderName}?`)) return;

        api.send({
            data: {
                CreateDir: {
                    name: `${root}/${createdFolderName}`
                }
            }
        })

        callback()
      },
      onMoveFile: ({ file }: TreeFile, { file: dest }: TreeFile) => {
        const { api, refreshFiles } = get();
        if (!api) return alert('No API');
        if (!file.name) return alert('No file name');
        if (!dest.name) return alert('No destination name');
        if (!dest.dir) return alert('No destination directory');
        if (getRootPath(file.name) === dest.name) return alert('Cannot move a file in-place');
        if (file.name === dest.name) return;
        if (!window.confirm(`Are you sure you want to move ${file.name} to ${dest.name}?`)) return;

        console.log('moving file', file.name, dest.name);

        api.send({
            data: {
                Move: {
                    source_path: file.name,
                    target_path: dest.name
                }
            }
        })

        setTimeout(() => refreshFiles(), 1000);
      },
      refreshFiles: () => {
        const { setFiles } = get()
        console.log('refreshing files')
        fetch(`${import.meta.env.BASE_URL}/files`)
          .then((response) => response.json())
          .then((data) => {
            try {
              setFiles(data.ListFiles)
            } catch {
              console.log("Failed to parse JSON files", data);
            }
          })
      },
      set,
      get,
    }),


    {
      name: 'kino_files', // unique name
      storage: createJSONStorage(() => sessionStorage), // (optional) by default, 'localStorage' is used
    }
  )
)

export default useFileTransferStore