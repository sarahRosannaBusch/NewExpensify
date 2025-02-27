import ExpensiMark from 'expensify-common/lib/ExpensiMark';
import {truncate} from 'lodash';
import lodashSortBy from 'lodash/sortBy';
import React from 'react';
import {View} from 'react-native';
import type {GestureResponderEvent} from 'react-native';
import ConfirmedRoute from '@components/ConfirmedRoute';
import Icon from '@components/Icon';
import * as Expensicons from '@components/Icon/Expensicons';
import MoneyRequestSkeletonView from '@components/MoneyRequestSkeletonView';
import MultipleAvatars from '@components/MultipleAvatars';
import OfflineWithFeedback from '@components/OfflineWithFeedback';
import PressableWithFeedback from '@components/Pressable/PressableWithoutFeedback';
import RenderHTML from '@components/RenderHTML';
import ReportActionItemImages from '@components/ReportActionItem/ReportActionItemImages';
import {showContextMenuForReport} from '@components/ShowContextMenuContext';
import Text from '@components/Text';
import useLocalize from '@hooks/useLocalize';
import useStyleUtils from '@hooks/useStyleUtils';
import useTheme from '@hooks/useTheme';
import useThemeStyles from '@hooks/useThemeStyles';
import useWindowDimensions from '@hooks/useWindowDimensions';
import ControlSelection from '@libs/ControlSelection';
import * as CurrencyUtils from '@libs/CurrencyUtils';
import * as DeviceCapabilities from '@libs/DeviceCapabilities';
import * as IOUUtils from '@libs/IOUUtils';
import * as Localize from '@libs/Localize';
import * as OptionsListUtils from '@libs/OptionsListUtils';
import * as ReceiptUtils from '@libs/ReceiptUtils';
import * as ReportActionsUtils from '@libs/ReportActionsUtils';
import * as ReportUtils from '@libs/ReportUtils';
import * as TransactionUtils from '@libs/TransactionUtils';
import ViolationsUtils from '@libs/Violations/ViolationsUtils';
import * as PaymentMethods from '@userActions/PaymentMethods';
import * as Report from '@userActions/Report';
import CONST from '@src/CONST';
import type {IOUMessage} from '@src/types/onyx/OriginalMessage';
import type {EmptyObject} from '@src/types/utils/EmptyObject';
import {isEmptyObject} from '@src/types/utils/EmptyObject';
import type {MoneyRequestPreviewProps} from './types';

function MoneyRequestPreviewContent({
    iouReport,
    isBillSplit,
    session,
    action,
    personalDetails,
    chatReport,
    transaction,
    contextMenuAnchor,
    chatReportID,
    reportID,
    onPreviewPressed,
    containerStyles,
    walletTerms,
    checkIfContextMenuActive = () => {},
    shouldShowPendingConversionMessage = false,
    isHovered = false,
    isWhisper = false,
    transactionViolations,
}: MoneyRequestPreviewProps) {
    const theme = useTheme();
    const styles = useThemeStyles();
    const StyleUtils = useStyleUtils();
    const {translate} = useLocalize();
    const {isSmallScreenWidth, windowWidth} = useWindowDimensions();
    const parser = new ExpensiMark();

    const sessionAccountID = session?.accountID;
    const managerID = iouReport?.managerID ?? -1;
    const ownerAccountID = iouReport?.ownerAccountID ?? -1;
    const isPolicyExpenseChat = ReportUtils.isPolicyExpenseChat(chatReport);

    const participantAccountIDs = action.actionName === CONST.REPORT.ACTIONS.TYPE.IOU && isBillSplit ? action.originalMessage.participantAccountIDs ?? [] : [managerID, ownerAccountID];
    const participantAvatars = OptionsListUtils.getAvatarsForAccountIDs(participantAccountIDs, personalDetails ?? {});
    const sortedParticipantAvatars = lodashSortBy(participantAvatars, (avatar) => avatar.id);
    if (isPolicyExpenseChat && isBillSplit) {
        sortedParticipantAvatars.push(ReportUtils.getWorkspaceIcon(chatReport));
    }

    // Pay button should only be visible to the manager of the report.
    const isCurrentUserManager = managerID === sessionAccountID;

    const {amount: requestAmount, currency: requestCurrency, comment: requestComment, merchant} = ReportUtils.getTransactionDetails(transaction) ?? {};
    const description = truncate(requestComment, {length: CONST.REQUEST_PREVIEW.MAX_LENGTH});
    const requestMerchant = truncate(merchant, {length: CONST.REQUEST_PREVIEW.MAX_LENGTH});
    const hasReceipt = TransactionUtils.hasReceipt(transaction);
    const isScanning = hasReceipt && TransactionUtils.isReceiptBeingScanned(transaction);
    const hasViolations = TransactionUtils.hasViolation(transaction?.transactionID ?? '', transactionViolations);
    const hasFieldErrors = TransactionUtils.hasMissingSmartscanFields(transaction);
    const shouldShowRBR = hasViolations || hasFieldErrors;
    const isDistanceRequest = TransactionUtils.isDistanceRequest(transaction);
    const isFetchingWaypointsFromServer = TransactionUtils.isFetchingWaypointsFromServer(transaction);
    const isCardTransaction = TransactionUtils.isCardTransaction(transaction);
    const isSettled = ReportUtils.isSettled(iouReport?.reportID);
    const isOnHold = TransactionUtils.isOnHold(transaction);
    const isDeleted = action?.pendingAction === CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE;

    /*
     Show the merchant for IOUs and expenses only if:
     - the merchant is not empty, is custom, or is not related to scanning smartscan;
     - the request is not a distance request with a pending route and amount = 0 - in this case,
       the merchant says: "Route pending...", which is already shown in the amount field;
    */
    const shouldShowMerchant =
        !!requestMerchant &&
        requestMerchant !== CONST.TRANSACTION.PARTIAL_TRANSACTION_MERCHANT &&
        requestMerchant !== CONST.TRANSACTION.DEFAULT_MERCHANT &&
        !(isFetchingWaypointsFromServer && !requestAmount);
    const shouldShowDescription = !!description && !shouldShowMerchant && !isScanning;

    let merchantOrDescription = requestMerchant;
    if (!shouldShowMerchant) {
        merchantOrDescription = description || '';
    }

    const receiptImages = hasReceipt ? [ReceiptUtils.getThumbnailAndImageURIs(transaction)] : [];

    const hasPendingWaypoints = transaction?.pendingFields?.waypoints;
    const showMapAsImage = isDistanceRequest && hasPendingWaypoints;

    const getSettledMessage = (): string => {
        if (isCardTransaction) {
            return translate('common.done');
        }
        return translate('iou.settledExpensify');
    };

    const showContextMenu = (event: GestureResponderEvent) => {
        showContextMenuForReport(event, contextMenuAnchor, reportID, action, checkIfContextMenuActive);
    };

    const getPreviewHeaderText = (): string => {
        if (isDistanceRequest) {
            return translate('common.distance');
        }

        if (isScanning) {
            return translate('common.receipt');
        }

        if (isBillSplit) {
            return translate('iou.split');
        }

        if (isCardTransaction) {
            let message = translate('iou.card');
            if (TransactionUtils.isPending(transaction)) {
                message += ` • ${translate('iou.pending')}`;
            }
            return message;
        }

        let message = translate('iou.cash');
        if (hasViolations && transaction) {
            const violations = TransactionUtils.getTransactionViolations(transaction.transactionID, transactionViolations);
            if (violations?.[0]) {
                const violationMessage = ViolationsUtils.getViolationTranslation(violations[0], translate);
                const isTooLong = violations.filter((v) => v.type === 'violation').length > 1 || violationMessage.length > 15;
                message += ` • ${isTooLong ? translate('violations.reviewRequired') : violationMessage}`;
            }
        } else if (ReportUtils.isPaidGroupPolicyExpenseReport(iouReport) && ReportUtils.isReportApproved(iouReport) && !ReportUtils.isSettled(iouReport?.reportID)) {
            message += ` • ${translate('iou.approved')}`;
        } else if (iouReport?.isWaitingOnBankAccount) {
            message += ` • ${translate('iou.pending')}`;
        } else if (iouReport?.isCancelledIOU) {
            message += ` • ${translate('iou.canceled')}`;
        } else if (isOnHold) {
            message += ` • ${translate('iou.hold')}`;
        }
        return message;
    };

    const getDisplayAmountText = (): string => {
        if (isScanning) {
            return translate('iou.receiptScanning');
        }

        if (isFetchingWaypointsFromServer && !requestAmount) {
            return translate('iou.routePending');
        }

        if (!isSettled && TransactionUtils.hasMissingSmartscanFields(transaction)) {
            return Localize.translateLocal('iou.receiptMissingDetails');
        }

        return CurrencyUtils.convertToDisplayString(requestAmount, requestCurrency);
    };

    const getDisplayDeleteAmountText = (): string => {
        const iouOriginalMessage: IOUMessage | EmptyObject = action?.actionName === CONST.REPORT.ACTIONS.TYPE.IOU ? action.originalMessage : {};
        const {amount = 0, currency = CONST.CURRENCY.USD} = iouOriginalMessage;

        return CurrencyUtils.convertToDisplayString(amount, currency);
    };

    const displayAmount = isDeleted ? getDisplayDeleteAmountText() : getDisplayAmountText();

    const childContainer = (
        <View>
            <OfflineWithFeedback
                errors={walletTerms?.errors}
                onClose={() => {
                    PaymentMethods.clearWalletTermsError();
                    Report.clearIOUError(chatReportID);
                }}
                errorRowStyles={[styles.mbn1]}
                needsOffscreenAlphaCompositing
            >
                <View
                    style={[
                        isScanning || isWhisper ? [styles.reportPreviewBoxHoverBorder, styles.reportContainerBorderRadius] : undefined,
                        !onPreviewPressed ? [styles.moneyRequestPreviewBox, containerStyles] : {},
                    ]}
                >
                    {showMapAsImage && (
                        <View style={styles.reportActionItemImages}>
                            <ConfirmedRoute transaction={transaction} />
                        </View>
                    )}
                    {!showMapAsImage && hasReceipt && (
                        <ReportActionItemImages
                            images={receiptImages}
                            isHovered={isHovered || isScanning}
                            size={1}
                        />
                    )}
                    {isEmptyObject(transaction) && !ReportActionsUtils.isMessageDeleted(action) && action.pendingAction !== CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE ? (
                        <MoneyRequestSkeletonView />
                    ) : (
                        <View style={styles.moneyRequestPreviewBoxText}>
                            <View style={[styles.flexRow]}>
                                <Text style={[styles.textLabelSupporting, styles.flex1, styles.lh20, styles.mb1]}>
                                    {getPreviewHeaderText() + (isSettled && !iouReport?.isCancelledIOU ? ` • ${getSettledMessage()}` : '')}
                                </Text>
                                {!isSettled && shouldShowRBR && (
                                    <Icon
                                        src={Expensicons.DotIndicator}
                                        fill={theme.danger}
                                    />
                                )}
                            </View>
                            <View style={[styles.flexRow]}>
                                <View style={[styles.flex1, styles.flexRow, styles.alignItemsCenter]}>
                                    <Text
                                        style={[
                                            styles.textHeadline,
                                            isBillSplit && StyleUtils.getAmountFontSizeAndLineHeight(isSmallScreenWidth, windowWidth, displayAmount.length, sortedParticipantAvatars.length),
                                            isDeleted && styles.lineThrough,
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {displayAmount}
                                    </Text>
                                    {ReportUtils.isSettled(iouReport?.reportID) && !isBillSplit && (
                                        <View style={styles.defaultCheckmarkWrapper}>
                                            <Icon
                                                src={Expensicons.Checkmark}
                                                fill={theme.iconSuccessFill}
                                            />
                                        </View>
                                    )}
                                </View>
                                {isBillSplit && (
                                    <View style={styles.moneyRequestPreviewBoxAvatar}>
                                        <MultipleAvatars
                                            icons={sortedParticipantAvatars}
                                            shouldStackHorizontally
                                            size="small"
                                            isHovered={isHovered}
                                            shouldUseCardBackground
                                        />
                                    </View>
                                )}
                            </View>
                            <View style={[styles.flexRow, styles.mt1]}>
                                <View style={[styles.flex1]}>
                                    {!isCurrentUserManager && shouldShowPendingConversionMessage && (
                                        <Text style={[styles.textLabel, styles.colorMuted]}>{translate('iou.pendingConversionMessage')}</Text>
                                    )}
                                    {shouldShowDescription && (
                                        <View style={[styles.breakWord, styles.preWrap]}>
                                            <RenderHTML html={`<muted-text>${parser.replace(merchantOrDescription)}</muted-text>`} />
                                        </View>
                                    )}
                                    {shouldShowMerchant && <Text style={[styles.textLabelSupporting, styles.textNormal]}>{merchantOrDescription}</Text>}
                                </View>
                                {isBillSplit && participantAccountIDs.length > 0 && !!requestAmount && requestAmount > 0 && (
                                    <Text style={[styles.textLabel, styles.colorMuted, styles.ml1, styles.amountSplitPadding]}>
                                        {translate('iou.amountEach', {
                                            amount: CurrencyUtils.convertToDisplayString(
                                                IOUUtils.calculateAmount(isPolicyExpenseChat ? 1 : participantAccountIDs.length - 1, requestAmount, requestCurrency ?? ''),
                                                requestCurrency,
                                            ),
                                        })}
                                    </Text>
                                )}
                            </View>
                        </View>
                    )}
                </View>
            </OfflineWithFeedback>
        </View>
    );

    if (!onPreviewPressed) {
        return childContainer;
    }

    const shouldDisableOnPress = isBillSplit && isEmptyObject(transaction);

    return (
        <PressableWithFeedback
            onPress={shouldDisableOnPress ? undefined : onPreviewPressed}
            onPressIn={() => DeviceCapabilities.canUseTouchScreen() && ControlSelection.block()}
            onPressOut={() => ControlSelection.unblock()}
            onLongPress={showContextMenu}
            accessibilityLabel={isBillSplit ? translate('iou.split') : translate('iou.cash')}
            accessibilityHint={CurrencyUtils.convertToDisplayString(requestAmount, requestCurrency)}
            style={[styles.moneyRequestPreviewBox, containerStyles, shouldDisableOnPress && styles.cursorDefault]}
        >
            {childContainer}
        </PressableWithFeedback>
    );
}

MoneyRequestPreviewContent.displayName = 'MoneyRequestPreview';

export default MoneyRequestPreviewContent;
