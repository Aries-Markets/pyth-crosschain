import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor'
import {
  getPythProgramKeyForCluster,
  pythOracleProgram,
} from '@pythnetwork/client'
import { PythOracle } from '@pythnetwork/client/lib/anchor'
import { useAnchorWallet, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import copy from 'copy-to-clipboard'
import { useContext, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { proposeInstructions } from 'xc-admin-common'
import { ClusterContext } from '../../contexts/ClusterContext'
import { usePythContext } from '../../contexts/PythContext'
import {
  getMultisigCluster,
  UPGRADE_MUTLTISIG,
  useMultisig,
} from '../../hooks/useMultisig'
import CopyIcon from '../../images/icons/copy.inline.svg'
import { capitalizeFirstLetter } from '../../utils/capitalizeFirstLetter'
import ClusterSwitch from '../ClusterSwitch'
import Modal from '../common/Modal'
import EditButton from '../EditButton'
import Loadbar from '../loaders/Loadbar'

interface UpdatePermissionsProps {
  account: PermissionAccount
  pubkey: string
  newPubkey?: string
}

const DEFAULT_DATA: UpdatePermissionsProps[] = [
  {
    account: 'Master Authority',
    pubkey: new PublicKey(0).toBase58(),
  },
  {
    account: 'Data Curation Authority',
    pubkey: new PublicKey(0).toBase58(),
  },
  {
    account: 'Security Authority',
    pubkey: new PublicKey(0).toBase58(),
  },
]

const BPF_UPGRADABLE_LOADER = new PublicKey(
  'BPFLoaderUpgradeab1e11111111111111111111111'
)

const columnHelper = createColumnHelper<UpdatePermissionsProps>()

const defaultColumns = [
  columnHelper.accessor('account', {
    cell: (info) => info.getValue(),
    header: () => <span>Account</span>,
  }),
  columnHelper.accessor('pubkey', {
    cell: (props) => {
      const pubkey = props.getValue()
      return (
        <>
          <div
            className="-ml-1 inline-flex cursor-pointer items-center px-1 hover:bg-dark hover:text-white active:bg-darkGray3"
            onClick={() => {
              copy(pubkey)
            }}
          >
            <span className="mr-2 hidden lg:block">{pubkey}</span>
            <span className="mr-2 lg:hidden">
              {pubkey.slice(0, 6) + '...' + pubkey.slice(-6)}
            </span>{' '}
            <CopyIcon className="shrink-0" />
          </div>
        </>
      )
    },
    header: () => <span>Public Key</span>,
  }),
]

// make a type with 3 possible values
type PermissionAccount =
  | 'Master Authority'
  | 'Data Curation Authority'
  | 'Security Authority'

interface PermissionAccountInfo {
  prev: string
  new: string
}

const UpdatePermissions = () => {
  const [data, setData] = useState(() => [...DEFAULT_DATA])
  const [columns, setColumns] = useState(() => [...defaultColumns])
  const [pubkeyChanges, setPubkeyChanges] =
    useState<Partial<Record<PermissionAccount, PermissionAccountInfo>>>()
  const [finalPubkeyChanges, setFinalPubkeyChanges] =
    useState<Record<PermissionAccount, PermissionAccountInfo>>()
  const [editable, setEditable] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSendProposalButtonLoading, setIsSendProposalButtonLoading] =
    useState(false)
  const { cluster } = useContext(ClusterContext)
  const anchorWallet = useAnchorWallet()
  const { isLoading: isMultisigLoading, squads } = useMultisig(
    anchorWallet as Wallet
  )
  const { rawConfig, dataIsLoading, connection } = usePythContext()
  const { connected } = useWallet()
  const [pythProgramClient, setPythProgramClient] =
    useState<Program<PythOracle>>()

  useEffect(() => {
    if (rawConfig.permissionAccount) {
      const masterAuthority =
        rawConfig.permissionAccount.masterAuthority.toBase58()
      const dataCurationAuthority =
        rawConfig.permissionAccount.dataCurationAuthority.toBase58()
      const securityAuthority =
        rawConfig.permissionAccount.securityAuthority.toBase58()
      setData([
        {
          account: 'Master Authority',
          pubkey: masterAuthority,
        },
        {
          account: 'Data Curation Authority',
          pubkey: dataCurationAuthority,
        },
        {
          account: 'Security Authority',
          pubkey: securityAuthority,
        },
      ])
    }
  }, [dataIsLoading, rawConfig])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const backfillPubkeyChanges = () => {
    const newPubkeyChanges: Record<PermissionAccount, PermissionAccountInfo> = {
      'Master Authority': {
        prev: data[0].pubkey,
        new: data[0].pubkey,
      },
      'Data Curation Authority': {
        prev: data[1].pubkey,
        new: data[1].pubkey,
      },
      'Security Authority': {
        prev: data[2].pubkey,
        new: data[2].pubkey,
      },
    }
    if (pubkeyChanges) {
      Object.keys(pubkeyChanges).forEach((key) => {
        newPubkeyChanges[key as PermissionAccount] = pubkeyChanges[
          key as PermissionAccount
        ] as PermissionAccountInfo
      })
    }

    return newPubkeyChanges
  }

  //   let newPubkeyChanges: Record<PermissionAccount, PermissionAccountInfo>
  //   data.forEach((d) => {
  //     if (!newPubkeyChanges[d.account]) {
  //       newPubkeyChanges[d.account] = {
  //         prev: d.pubkey,
  //         new: d.pubkey,
  //       }
  //     }
  //   })

  // return newPubkeyChanges

  const handleEditButtonClick = () => {
    const nextState = !editable
    if (nextState) {
      setColumns([
        ...defaultColumns,
        columnHelper.accessor('newPubkey', {
          cell: (info) => info.getValue(),
          header: () => <span>New Public Key</span>,
        }),
      ])
    } else {
      if (pubkeyChanges && Object.keys(pubkeyChanges).length > 0) {
        openModal()
        setFinalPubkeyChanges(backfillPubkeyChanges())
      } else {
        setColumns(defaultColumns)
      }
    }
    setEditable(nextState)
  }

  const openModal = () => {
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
  }

  // check if pubkey is valid
  const isValidPubkey = (pubkey: string) => {
    try {
      new PublicKey(pubkey)
      return true
    } catch (e) {
      return false
    }
  }

  const handleEditPubkey = (
    e: any,
    account: PermissionAccount,
    prevPubkey: string
  ) => {
    const newPubkey = e.target.textContent
    if (isValidPubkey(newPubkey) && newPubkey !== prevPubkey) {
      setPubkeyChanges({
        ...pubkeyChanges,
        [account]: {
          prev: prevPubkey,
          new: newPubkey,
        },
      })
    }
  }

  const handleSendProposalButtonClick = () => {
    if (pythProgramClient && finalPubkeyChanges) {
      const programDataAccount = PublicKey.findProgramAddressSync(
        [pythProgramClient?.programId.toBuffer()],
        BPF_UPGRADABLE_LOADER
      )[0]
      pythProgramClient?.methods
        .updPermissions(
          new PublicKey(finalPubkeyChanges['Master Authority'].new),
          new PublicKey(finalPubkeyChanges['Data Curation Authority'].new),
          new PublicKey(finalPubkeyChanges['Security Authority'].new)
        )
        .accounts({
          upgradeAuthority: squads?.getAuthorityPDA(
            UPGRADE_MUTLTISIG[getMultisigCluster(cluster)],
            1
          ),
          programDataAccount,
        })
        .instruction()
        .then(async (instruction) => {
          if (!isMultisigLoading && squads) {
            setIsSendProposalButtonLoading(true)
            try {
              const proposalPubkey = await proposeInstructions(
                squads,
                UPGRADE_MUTLTISIG[getMultisigCluster(cluster)],
                [instruction],
                false
              )
              toast.success(
                `Proposal sent! 🚀 Proposal Pubkey: ${proposalPubkey}`
              )
              setIsSendProposalButtonLoading(false)
            } catch (e: any) {
              toast.error(capitalizeFirstLetter(e.message))
              setIsSendProposalButtonLoading(false)
            }
          }
        })
    }
  }

  // create anchor wallet when connected
  useEffect(() => {
    if (connected) {
      const provider = new AnchorProvider(
        connection,
        anchorWallet as Wallet,
        AnchorProvider.defaultOptions()
      )
      setPythProgramClient(
        pythOracleProgram(getPythProgramKeyForCluster(cluster), provider)
      )
    }
  }, [anchorWallet, connection, connected, cluster])

  return (
    <div className="relative">
      <Modal
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        closeModal={closeModal}
        changes={pubkeyChanges}
        handleSendProposalButtonClick={handleSendProposalButtonClick}
        isSendProposalButtonLoading={isSendProposalButtonLoading}
      />
      <div className="container flex flex-col items-center justify-between lg:flex-row">
        <div className="mb-4 w-full text-left lg:mb-0">
          <h1 className="h1 mb-4">Update Permissions</h1>
        </div>
      </div>
      <div className="container">
        <div className="flex justify-between">
          <div className="mb-4 md:mb-0">
            <ClusterSwitch />
          </div>
          <div className="mb-4 md:mb-0">
            <EditButton editable={editable} onClick={handleEditButtonClick} />
          </div>
        </div>
        <div className="relative mt-6">
          {dataIsLoading ? (
            <div className="mt-3">
              <Loadbar theme="light" />
            </div>
          ) : (
            <div className="table-responsive mb-10">
              <table className="w-full table-auto bg-darkGray text-left">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className={
                            header.column.id === 'account'
                              ? 'base16 pt-8 pb-6 pl-4 pr-2 font-semibold opacity-60 xl:pl-14'
                              : 'base16 pt-8 pb-6 pl-1 pr-2 font-semibold opacity-60'
                          }
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-t border-beige-300">
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          onBlur={(e) =>
                            handleEditPubkey(
                              e,
                              cell.row.original.account,
                              cell.row.original.pubkey
                            )
                          }
                          contentEditable={
                            cell.column.id === 'newPubkey' && editable
                              ? true
                              : false
                          }
                          suppressContentEditableWarning={true}
                          className={
                            cell.column.id === 'account'
                              ? 'py-3 pl-4 pr-2 xl:pl-14'
                              : 'items-center py-3 pl-1 pr-4'
                          }
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default UpdatePermissions