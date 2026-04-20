import { useEffect, useMemo, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { OrganisationMemberRole } from '@prisma/client';
import type * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, ChevronsUpDown, Loader, PlusCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { useDebouncedValue } from '@documenso/lib/client-only/hooks/use-debounced-value';
import { AppError } from '@documenso/lib/errors/app-error';
import { ORGANISATION_MEMBER_ROLE_MAP } from '@documenso/lib/constants/organisations-translations';
import { trpc } from '@documenso/trpc/react';
import type { TFindUsersResponse } from '@documenso/trpc/server/admin-router/find-users.types';
import { ZAddUserToOrganisationRequestSchema } from '@documenso/trpc/server/admin-router/add-user-to-organisation.types';
import { cn } from '@documenso/ui/lib/utils';
import { Button } from '@documenso/ui/primitives/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@documenso/ui/primitives/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@documenso/ui/primitives/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@documenso/ui/primitives/form/form';
import { Input } from '@documenso/ui/primitives/input';
import { Popover, PopoverContent, PopoverTrigger } from '@documenso/ui/primitives/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@documenso/ui/primitives/select';
import { useToast } from '@documenso/ui/primitives/use-toast';

export type AdminOrganisationMemberCreateDialogProps = {
  organisationId: string;
  trigger?: React.ReactNode;
} & Omit<DialogPrimitive.DialogProps, 'children'>;

const ZAddOrganisationMemberFormSchema = ZAddUserToOrganisationRequestSchema.pick({
  organisationRole: true,
  userId: true,
});

type TAddOrganisationMemberFormSchema = z.infer<typeof ZAddOrganisationMemberFormSchema>;

type UserOption = TFindUsersResponse[number];

const ORGANISATION_ROLE_OPTIONS = [
  OrganisationMemberRole.ADMIN,
  OrganisationMemberRole.MANAGER,
  OrganisationMemberRole.MEMBER,
];

export const AdminOrganisationMemberCreateDialog = ({
  organisationId,
  trigger,
  ...props
}: AdminOrganisationMemberCreateDialogProps) => {
  const { _, i18n } = useLingui();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);

  const form = useForm<TAddOrganisationMemberFormSchema>({
    resolver: zodResolver(ZAddOrganisationMemberFormSchema),
    defaultValues: {
      organisationRole: OrganisationMemberRole.MEMBER,
    },
  });

  const { mutateAsync: addMember } = trpc.admin.organisationMember.add.useMutation();

  const onFormSubmit = async ({ organisationRole, userId }: TAddOrganisationMemberFormSchema) => {
    try {
      await addMember({
        organisationId,
        organisationRole,
        userId,
      });

      setOpen(false);

      toast({
        title: _(msg`Success`),
        description: _(msg`Member added`),
        duration: 5000,
      });
    } catch (err) {
      const error = AppError.parseError(err);

      toast({
        title: _(msg`Error`),
        description: error.userMessage ?? error.message ?? _(msg`An unknown error occurred`),
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    form.reset({
      organisationRole: OrganisationMemberRole.MEMBER,
    });
    setSelectedUser(null);
  }, [open, form]);

  return (
    <Dialog
      {...props}
      open={open}
      onOpenChange={(value) => !form.formState.isSubmitting && setOpen(value)}
    >
      <DialogTrigger onClick={(e) => e.stopPropagation()} asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <PlusCircle className="mr-2 h-4 w-4" />
            <Trans>Add member</Trans>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent position="center">
        <DialogHeader>
          <DialogTitle>
            <Trans>Add member</Trans>
          </DialogTitle>

          <DialogDescription>
            <Trans>Add an existing user to this organisation.</Trans>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onFormSubmit)}>
            <fieldset
              className="flex h-full flex-col space-y-4"
              disabled={form.formState.isSubmitting}
            >
              <FormField
                control={form.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>
                      <Trans>User</Trans>
                    </FormLabel>
                    <FormControl>
                      <div>
                        <Input type="hidden" value={field.value ?? ''} onChange={field.onChange} />

                        <AdminUserSearchCombobox
                          organisationId={organisationId}
                          selectedUser={selectedUser}
                          onSelect={(user) => {
                            setSelectedUser(user);
                            field.onChange(user.id);
                            form.trigger('userId');
                          }}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="organisationRole"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>
                      <Trans>Organisation Role</Trans>
                    </FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>

                        <SelectContent position="popper">
                          {ORGANISATION_ROLE_OPTIONS.map((role) => (
                            <SelectItem key={role} value={role}>
                              {i18n._(ORGANISATION_MEMBER_ROLE_MAP[role])}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  <Trans>Cancel</Trans>
                </Button>

                <Button type="submit" loading={form.formState.isSubmitting}>
                  <Trans>Add</Trans>
                </Button>
              </DialogFooter>
            </fieldset>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

type AdminUserSearchComboboxProps = {
  organisationId: string;
  selectedUser: UserOption | null;
  onSelect: (user: UserOption) => void;
};

const AdminUserSearchCombobox = ({
  organisationId,
  selectedUser,
  onSelect,
}: AdminUserSearchComboboxProps) => {
  const { _ } = useLingui();

  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const { data: users = [], isLoading } = trpc.admin.user.find.useQuery(
    {
      organisationId,
      query: debouncedSearchQuery,
    },
    {
      enabled: open,
    },
  );

  const triggerLabel = useMemo(() => {
    if (!selectedUser) {
      return _(msg`Search by name or email`);
    }

    return selectedUser.name ?? selectedUser.email;
  }, [selectedUser, _]);

  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);

        if (!value) {
          setSearchQuery('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={_(msg`Search by name or email`)}
            value={searchQuery}
            onValueChange={setSearchQuery}
          />

          {!isLoading && (
            <CommandEmpty>
              <Trans>No user found.</Trans>
            </CommandEmpty>
          )}

          <CommandGroup className="max-h-[250px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              users.map((user) => (
                <CommandItem
                  key={user.id}
                  value={`${user.name ?? ''} ${user.email}`}
                  onSelect={() => {
                    onSelect(user);
                    setOpen(false);
                    setSearchQuery('');
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      user.id === selectedUser?.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />

                  <div className="flex flex-col">
                    <span>{user.name ?? user.email}</span>
                    {user.name && (
                      <span className="text-xs text-muted-foreground">{user.email}</span>
                    )}
                  </div>
                </CommandItem>
              ))
            )}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
